# US job sources: keep JSearch, drop three, add SerpApi

Date: 2026-11-07
Status: reviewed against the code and SerpApi's docs on 2026-11-07; approved for planning

## Goal

Find jobs searches US-focused sources. JSearch stays (it still returns LinkedIn,
Indeed and Glassdoor postings). Adzuna, the Bundesagentur für Arbeit and
FreeHire are removed. SerpApi (Google Jobs engine, a US vendor) is added.

Out of scope this round: USAJOBS, CareerOneStop and Greenhouse. Each is a later,
separate adapter. Greenhouse in particular needs a company-board list, which is
a design question of its own.

## Constraints

- Selecting one source at a time stays as it is. No multi-source fan-out.
- Data stays local: the new adapter calls only `serpapi.com`, and nothing new
  goes to the upstream project (AienTech / aien.me) or its hosts.
- New code follows the existing `JobSourceAdapter` pattern in
  `src/lib/job-search/adapter.ts`.

## Findings that shape the design

- `PostingSource` is a Prisma enum in both `prisma/schema.prisma` and
  `prisma/sqlite/schema.prisma`, and about 60 files reference the sources.
- Four tables carry a `source` column: `Posting`, `PostingSearch`,
  `PostingScore`, `AgentCandidate`.
- Deleting `Posting` rows never deletes an application. `Application` holds its
  own copy of the posting text and URL, and `Posting.applicationId` is nullable
  with `onDelete: SetNull`.
- Postgres migrations live in `prisma/migrations`, SQLite ones in
  `prisma/sqlite/migrations`; each gets its own migration.

## 1. Remove Adzuna, Bundesagentur für Arbeit, FreeHire

- Delete `adzuna.ts`, `arbeitsagentur.ts`, `freehire.ts`, their tests, and
  `src/components/arbeitsagentur-note.tsx`.
- Remove their entries from `SOURCE_INFO`, `SourceCredentials`, `JOB_SOURCES`,
  `config.ts`, and the Bundesagentur note and terms helpers in `sources.ts`.
- Remove their UI from Settings → Job search, the welcome jobs step and the
  agent section, and from the Find jobs screen.
- Remove env vars `DOSSIER_ADZUNA_APP_ID`, `DOSSIER_ADZUNA_KEY`,
  `DOSSIER_FREEHIRE_URL`, `DOSSIER_JOBS_ARBEITSAGENTUR` from `.env.example`,
  `compose.production.yml`, `compose.jetson.yml` and `src/lib/env.ts`
  (including the `arbeitsagentur`/`off` cross-check there). Add
  `DOSSIER_SERPAPI_KEY` and the `serpapi` value of `DOSSIER_JOBS_SOURCE`.
  A server still setting `DOSSIER_JOBS_SOURCE=adzuna|arbeitsagentur|freehire`
  fails env validation at start with the existing "must be one of ..." message.
  That is intended, and `DEVELOPMENT.md` says so.
- Remove from `config.ts`/`sources.ts`: `arbeitsagenturStartupNotice`,
  `ARBEITSAGENTUR_*`, `arbeitsagenturPage`, `FREEHIRE_URL`, and the FreeHire
  branch and parameter of `requestContext`. Keep the generic attribution
  fields on `SourceInfo`.
- `src/lib/agent/run.ts`: remove the Bundesagentur branch and reword the
  "choose a source" message to name JSearch and SerpApi.
- `src/lib/setup/job-choices.ts` and the welcome jobs step: remove the dropped
  choices and add a SerpApi choice with its own sign-up steps. FreeHire was the
  only keyless "Mostly tech" choice, so that kind goes too, leaving "Any kind
  of job" (JSearch, SerpApi) and "None for now".
- Update `PRIVACY.md`, `DEVELOPMENT.md`, `README.md`, `site/index.html` where
  they name a removed source, `src/instrumentation.ts` (drop the Bundesagentur
  startup notice), and the e2e fake source (`e2e/fake-jobs.mts`, which gets a
  `/serpapi` route; `requestContext` sends test traffic to
  `<base>/<source lowercased>`).
- A saved source that is one of the removed ones reads as OFF. `settings.ts`
  parses `jobSource` with `.catch(null)`, and null means "not set, use the
  environment", so the migration rewrites a stored removed value to `OFF`
  instead of relying on the parse.

## 2. Migration (one for Postgres, one for SQLite)

1. Delete rows whose source is ADZUNA, ARBEITSAGENTUR or FREEHIRE from
   `Posting`, `PostingSearch`, `PostingScore` and `AgentCandidate`.
2. Replace the `PostingSource` enum with `JSEARCH` and `SERPAPI`. In Postgres:
   rename the old type, create the new one, `ALTER COLUMN ... TYPE ... USING
   source::text::"PostingSource"` on the four tables, drop the old type. In
   SQLite the enum is plain TEXT, so only the deletes (and the Prisma schema
   change) are needed.
3. In the `Setting` key-value table: set `jobSource` to `OFF` when it holds a
   removed source, and delete the `adzunaAppId`, `adzunaKeyEnc` and
   `arbeitsagenturAcceptedAt` rows. Remove those three fields from the
   settings schema.
4. Data export and import (`src/lib/data-export.ts`, `data-import.ts`):
   - The export schemas use `z.enum(PostingSource)`, so an old file with a
     removed source would fail the whole import. Pre-filter `postings`,
     `searches` and `agentCandidates` to drop rows of removed sources before
     validation, so the rest of the file still imports.
   - `jobSourceKeys` drops `adzuna` and gains `serpapi`; `SECRET_SETTINGS`
     drops `adzunaKeyEnc` and gains `serpapiKeyEnc`.
   - Bump the export version (9 to 10): files carrying `SERPAPI` rows or a
     SerpApi key are unreadable by older importers.

## 3. SerpApi adapter (`src/lib/job-search/serpapi.ts`)

- Host: `serpapi.com` only.
Checked against serpapi.com/google-jobs-api and /pricing on 2026-11-07.

- Host: `serpapi.com` only, with the key as `api_key`.
- Request: `GET /search.json` with `engine=google_jobs`, `hl=en`, `q` as
  "keywords in place" (the place goes in the query text, as JSearch's adapter
  does it and as Google reads it; SerpApi's `location` parameter is where the
  search *originates*, wants Google's own place names, and is not sent),
  `gl` from the country (`us` when none is chosen), and `next_page_token` from
  the previous page's `serpapi_pagination` for further pages. Pages hold up to
  10 results; the old `start` offset no longer works.
- "Posted within" cannot go to SerpApi: its `chips` parameter is deprecated by
  Google. The adapter reads `detected_extensions.posted_at` (relative text such
  as "3 days ago") and filters results itself; a posting that doesn't say
  stays, as in `fitsExperience`.
- Result fields used: `title`, `company_name`, `location`, `via`,
  `description`, `detected_extensions` (`posted_at`, `salary`, `schedule_type`),
  `job_id` as the external id, `apply_options[].link` for the URL (falling
  back to `share_link`). The `detected_extensions` field set is only partly
  documented, so the adapter treats every field in it as optional.
- Descriptions come with the result, so postings are marked `complete` and
  `details` returns null.
- `radius: false`. `lrad` exists but "does not strictly limit the radius", so
  the place only puts nearby postings first. Countries are not restricted
  (`countries: null`).
- Credentials: `{ key: string }`, from `DOSSIER_SERPAPI_KEY` or Settings
  (`serpapiKeyEnc`, encrypted like the other keys), with a key field styled
  like JSearch's. `test()` runs one minimal search.
- Plan: 250 free searches a month, 50 an hour; paid tiers start at $25 for
  1,000. Settings and the setup guide say so, and `quotaPeriod` is
  "this month".
- The docs don't document error responses. The adapter's error mapping
  (bad key, used-up quota, rate limit, no results) is written against a live
  probe with a real key, recorded as fixtures; until then it assumes the
  conventional statuses (401/403 key, 429 quota or rate) and treats anything
  else as `unavailable`/`changed`, which is logged.

## 4. Testing

- Fixture-based adapter tests following `jsearch.test.ts`; a live test that is
  skipped without a key, following `sources.live.test.ts`.
- The migrations are checked on scratch databases (SQLite file and a scratch
  Postgres database), never the user's data, because a Vitest run starts after
  every migration has been applied: removed-source rows are gone from the four
  tables, applications and JSearch rows survive, a stored `jobSource` of a
  removed source becomes `OFF`, and the removed credential rows are gone.
- Import test for an old (version 9) export that contains removed sources: the
  removed rows are skipped and everything else imports.
- Env tests (`src/lib/env.test.ts`) and config tests for `serpapi` and the
  removed values.
- The SerpApi fixtures come from a live probe, when a key is available; the
  live test stays skipped without one.
- Update `e2e/find-jobs.spec.ts`; then typecheck, lint and the full test run.
