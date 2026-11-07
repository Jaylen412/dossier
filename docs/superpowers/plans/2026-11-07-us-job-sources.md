# US Job Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find jobs searches JSearch and SerpApi; Adzuna, the Bundesagentur für Arbeit and FreeHire are gone, with their stored data.

**Architecture:** SerpApi is a new `JobSourceAdapter` behind the existing registry (`adapter.ts`, `sources.ts`, `index.ts`, `config.ts`). It lands first and additively, so every task before the last keeps the tree green. The removal comes after as one task, because `JobSource` is the generated Prisma enum and every `Record<JobSource, …>` stops compiling the moment a value leaves it.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7 (PostgreSQL, plus a derived SQLite schema), zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-us-job-sources-design.md`

## Global Constraints

- Work on a new branch `feature/us-job-sources`, cut from `feature/privacy-enhancement`. Commit steps below apply only once the user has approved execution.
- Commands: the project runs through containers (`DEVELOPMENT.md`): `docker/bin/yarn <script>`. `yarn` is not installed on the host; non-DB unit tests also run with `node_modules/.bin/vitest run <file>`. DB tests need the compose Postgres.
- Nothing may reach the upstream project: `src/lib/no-upstream.test.ts` must stay green. The only new host is `serpapi.com`, and the key goes only there.
- Never read `.env`, never print a key, never write one into a file or fixture. No request to `serpapi.com` unless the user gives a key for the live probe (Task 5); fixtures come from the docs until then.
- Migrations are checked on **scratch databases only**, never the user's data. `yarn sqlite-schema` regenerates `prisma/sqlite/schema.prisma` from `prisma/schema.prisma`, which is the only schema to edit by hand.
- SerpApi, checked on 2026-11-07: `GET https://serpapi.com/search.json`, `engine=google_jobs`, `api_key` as a query parameter, `gl` country, `hl`, `next_page_token` from `serpapi_pagination.next_page_token`, 10 results a page. `chips`, `ltype` and `start` are dead; `lrad` is soft; `location` is not sent. Free plan: 250 searches a month, 50 an hour; Starter is $25 for 1,000.
- Copy for SerpApi in `SOURCE_INFO`: name `SerpApi`; description `Postings from LinkedIn, Indeed, Glassdoor and company sites, through Google for Jobs, from a US service.`; tag `Most countries · 250 free searches a month`; `keyUrl` `https://serpapi.com/users/sign_up`; `quotaPeriod` `this month`; `attribution` and `attributionLink` null; `countries` null; `radius` false.
- Migration timestamps: Postgres `20261107120000_serpapi_source`, then `20261107130000_us_job_sources`; SQLite `20261107130000_us_job_sources`.
- Export version 9 → 10 (`src/lib/data-export.ts`).
- Settings keys: add `serpapiKeyEnc`; remove `adzunaAppId`, `adzunaKeyEnc`, `arbeitsagenturAcceptedAt`. Env: add `DOSSIER_SERPAPI_KEY` and `serpapi` in `JOB_SOURCE_NAMES`; remove `DOSSIER_ADZUNA_APP_ID`, `DOSSIER_ADZUNA_KEY`, `DOSSIER_FREEHIRE_URL`, `DOSSIER_JOBS_ARBEITSAGENTUR`.

## Review Focus

Failure modes the spec implies that no obvious test exercises; each has a test in the task named.

1. A search with no matches: SerpApi answers HTTP 200 with an `error` text, which must be an empty page, not "the API changed" (Task 1).
2. `posted_at` text that isn't "N days ago": "Just posted", "30+ days ago", missing. Missing and unparseable stay; "30+" does not fit a month window (Task 1).
3. The key leaking: it sits in the request URL, so no error, log detail or past search may contain it (Task 1).
4. An upgrade with `jobSource` saved as a removed source: Find jobs, the agent and Settings must show Off, not fall back to `DOSSIER_JOBS_SOURCE` and not crash (Task 3).
5. A version-9 export carrying removed-source postings, searches and agent candidates, plus an application linked to one: everything else imports and the application survives (Task 3).

---

### Task 1: SerpApi as a working backend source

**Files:**
- Create: `src/lib/job-search/serpapi.ts`, `src/lib/job-search/serpapi.test.ts`, `prisma/migrations/20261107120000_serpapi_source/migration.sql`
- Modify: `prisma/schema.prisma` (enum `PostingSource` gains `SERPAPI`), `prisma/sqlite/schema.prisma` (via `yarn sqlite-schema`), `src/test/job-search-fixtures.ts`, `src/lib/job-search/adapter.ts`, `sources.ts`, `search.ts` (`JOB_SOURCES`), `index.ts` (`ADAPTERS`), `config.ts`, `config.test.ts`, `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/settings.ts`, `src/lib/data-export.ts` (`SECRET_SETTINGS` gains `serpapiKeyEnc`)
- Test: the files above

**Interfaces:**
- Produces: `serpapi: JobSourceAdapter<"SERPAPI">` and `postedAgeDays(text: string | null | undefined): number | null` from `serpapi.ts`; `SourceCredentials["SERPAPI"] = { key: string }`; `JobSearchConfig["serpapi"] = { key: string | null; keyState: JobKeyState }`; `JobSearchSettingsView["serpapi"] = { keyState: JobKeyState }`; `SettingsData.serpapiKeyEnc: string | null`; env `DOSSIER_SERPAPI_KEY?: string`; fixtures `serpapiPage`, `serpapiLastPage`, `serpapiNoResults` from `@/test/job-search-fixtures`.
- Consumes: `requestJson`, `jobSearchError`, `safeLink`, `POSTED_WITHIN`, `FoundPosting`, `SearchQuery` as `jsearch.ts` does.

- [ ] **Step 1: Run the baseline.** `docker/bin/yarn typecheck`, `docker/bin/yarn lint`, `docker/bin/yarn vitest run src/lib/job-search src/lib/no-upstream.test.ts src/lib/env.test.ts`. Expected: all green. Write down how many tests pass in the full `docker/bin/yarn test` run too, for Task 3's comparison. If anything is red, stop and report; nothing below should start from red.
- [ ] **Step 2: Write the fixtures** in `src/test/job-search-fixtures.ts`, from the docs' response shape: `serpapiPage` (3 jobs: one with `apply_options` and `detected_extensions { posted_at: "3 days ago", salary: "$90K–$120K a year", work_from_home: true }`; one with only `share_link`; one with no `detected_extensions`; `serpapi_pagination.next_page_token: "tok-1"`), `serpapiLastPage` (no pagination), `serpapiNoResults` (`{ error: "Google hasn't returned any results for this query." }`). Mark the file comment "from SerpApi's documentation; replaced by a live probe in Task 5".
- [ ] **Step 3: Write the failing tests** in `serpapi.test.ts`, in the style of `jsearch.test.ts` (`stubFetch`, `json`, `refused`). Credentials `{ key: "serp_test" }`, query `{ ...EMPTY_QUERY, keywords: "product designer", place: "Chicago", country: "de", postedWithin: "week" }`:
  - `asks google_jobs with the key, query text, country and language`: origin+pathname `https://serpapi.com/search.json`; `Object.fromEntries(url.searchParams)` equals `{ engine: "google_jobs", q: "product designer in Chicago", gl: "de", hl: "en", api_key: "serp_test" }` (so no `location`, `chips`, `lrad`).
  - `searches the US when no country is chosen`: `gl` is `us`; with no place `q` is just the keywords.
  - `pages with next_page_token`: first page `next` is `"token:tok-1"`; passing that back sends `next_page_token=tok-1`; `serpapiLastPage` gives `next: null`.
  - `reads a posting from a result`: `source "SERPAPI"`, `externalId` is `job_id`, `company` from `company_name`, `place` from `location`, `via` from `via`, `url` is the first safe `apply_options` link, `salary` from `detected_extensions.salary`, `remote` true from `work_from_home` (null when absent), `complete` true when the description is non-empty, `postedAt` about three days before the `now` passed in.
  - `falls back to share_link when there is no apply link`.
  - `skips results without a job_id and duplicates`.
  - `keeps only postings within the asked recency by their posted_at text` (Review Focus 2): for `week`, keeps "3 days ago", "1 week ago", "Just posted" and a missing `posted_at`; drops "2 weeks ago"; for `month`, drops "30+ days ago"; for `any`, keeps all.
  - `postedAgeDays` table: `"Just posted"`/`"today"`/`"5 hours ago"`/`"20 minutes ago"` → 0, `"1 day ago"` → 1, `"3 days ago"` → 3, `"2 weeks ago"` → 14, `"1 month ago"` → 30, `"30+ days ago"` → 31, `"yesterday-ish"`/`""`/`null` → null.
  - `answers an empty page when Google had no results` (Review Focus 1): `serpapiNoResults` with status 200 gives `{ postings: [], next: null }`.
  - `calls any other error answer a change`: `{ error: "Something else" }` rejects with `JobSearchError` problem `changed`.
  - `maps 401 to key and 429 to quota, and the key is never in the error` (Review Focus 3): neither `message` nor `detail` contains `serp_test`; also a `fetch` that throws leaves no key in `detail`.
  - `test() makes one search`: one request, resolves.
- [ ] **Step 4: Run them to see them fail.** `docker/bin/yarn vitest run src/lib/job-search/serpapi.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 5: Add the enum value.** `SERPAPI` in `PostingSource`; run `docker/bin/yarn sqlite-schema` and `docker/bin/yarn generate`; write the Postgres migration (`ALTER TYPE "PostingSource" ADD VALUE 'SERPAPI';`). No SQLite migration is needed: its enum is plain TEXT, and `prisma/sqlite/derive.test.ts` confirms the diff is empty.
- [ ] **Step 6: Implement `serpapi.ts`** with `postedAgeDays` and `postingFromJob(job, now: Date): FoundPosting`, modeled on `jsearch.ts`: a zod `jobSchema` where every field is `nullish().catch(null)` and `job_id` is the only required one, a `responseSchema` for `jobs_results` and `serpapi_pagination`, the same field-length caps as `postingFromJob` in `jsearch.ts`. Filtering by recency uses `POSTED_WITHIN`'s `days`: keep when either side is null or `age <= days`. `postedAt` is `now` minus the age in days, null when the age is unknown. The adapter's `details` returns the description or null, like JSearch's.
- [ ] **Step 7: Wire it up**, until `docker/bin/yarn typecheck` is green: `SourceCredentials` and `SOURCE_INFO` (copy from Global Constraints), `JOB_SOURCES` in `search.ts`, `ADAPTERS` in `index.ts`, `JobSearchConfig`/`SavedJobSettings`/`JobEnv`/`FROM_ENV`/`credentialsFor`/`jobSearchView` in `config.ts`, `serpapiKeyEnc` in `settings.ts` and `SECRET_SETTINGS`, `DOSSIER_SERPAPI_KEY` and `serpapi` in `env.ts`.
- [ ] **Step 8: Add config and env tests.** `config.test.ts`: a saved SerpApi key resolves to `keyState "set"`, the env key to `"env"`, none to `"none"`, and `credentialsFor(config, "SERPAPI")` throws a `no-key` `JobSearchError` without one. `env.test.ts`: `DOSSIER_JOBS_SOURCE=serpapi` parses; `DOSSIER_SERPAPI_KEY` is accepted.
- [ ] **Step 9: Run everything.** `docker/bin/yarn typecheck && docker/bin/yarn lint && docker/bin/yarn vitest run src/lib/job-search src/lib/env.test.ts src/lib/no-upstream.test.ts prisma/sqlite/derive.test.ts`. Expected: all pass.
- [ ] **Step 10: Commit.** `git add -A && git commit -m "feat(jobs): add SerpApi as a job source"`

---

### Task 2: SerpApi in Settings, the setup guide and the e2e fake

**Files:**
- Modify: `src/app/(app)/settings/actions.ts`, `src/app/(app)/settings/job-search-section.tsx`, `job-search-section.test.tsx`, `actions.db.test.ts`, `src/lib/setup/job-choices.ts`, `src/lib/setup/job-choices.test.ts`, `src/app/(setup)/welcome/jobs-step.tsx`, `e2e/fake-jobs.mts`, `e2e/find-jobs.spec.ts`

**Interfaces:**
- Consumes: Task 1's `SOURCE_INFO.SERPAPI`, `JobSearchSettingsView["serpapi"]`, `settings.serpapiKeyEnc`.
- Produces: `saveJobSourceKey` accepting `source: "SERPAPI"`; `JOB_CHOICES` entry `{ source: "SERPAPI", kind: "any", name: "SerpApi", … }`.

- [ ] **Step 1: Write the failing tests.**
  - `actions.db.test.ts`: `saves a SerpApi key encrypted and never returns it`: after `saveJobSourceKey({ source: "SERPAPI", change: { action: "set", value: "serp_secret" } })` the stored `serpapiKeyEnc` is non-null and does not contain `serp_secret`, the returned view has `serpapi.keyState === "set"` and `JSON.stringify(view)` does not contain it; `clear` resets it to `"none"`.
  - `job-search-section.test.tsx`: `shows SerpApi's key field with its sign-up link when SerpApi is chosen` (the link's `href` is `https://serpapi.com/users/sign_up`; the env name `DOSSIER_SERPAPI_KEY` is shown, as for JSearch) and `saves the key with source SERPAPI`; the connection note for SerpApi says a test uses one search from the plan, as JSearch's does.
  - `job-choices.test.ts`: `offers SerpApi under "Any kind of job" with a sign-up step linking to https://serpapi.com/users/sign_up`.
- [ ] **Step 2: Run them to see them fail.** `docker/bin/yarn vitest run src/app/\(app\)/settings src/lib/setup/job-choices.test.ts`. Expected: FAIL on the new tests only.
- [ ] **Step 3: Implement.** `saveJobSourceKey`'s `source` enum gains `"SERPAPI"` and maps it to `serpapiKeyEnc`; the Settings section gets a `SERPAPI` block mirroring JSearch's key field (`envName="DOSSIER_SERPAPI_KEY"`, `getKey` from `SOURCE_INFO.SERPAPI.keyUrl`); `ConnectionStatus`' one-search note applies to SERPAPI too; `job-choices.ts` gains the `SERPAPI` choice (about = the `SOURCE_INFO` description; cost = `A free plan of 250 searches a month, no card needed. Paid plans start at $25 for 1,000.`; steps: sign up at `https://serpapi.com/users/sign_up`, copy the API key from the account's dashboard and paste it below), and `JobChoice["source"]` accepts it; `jobs-step.tsx` saves the SerpApi key the same way it does JSearch's.
- [ ] **Step 4: Add the e2e fake and spec.** `fake-jobs.mts` answers `GET /serpapi/search.json` with one posting (`Product Designer`, company `Ledgerly`, key checked against `e2e-serpapi-key`, wrong key → 401); `find-jobs.spec.ts` gains `finds postings through SerpApi`: choose SerpApi in Settings, save the fake key, search, see `Ledgerly`.
- [ ] **Step 5: Run.** `docker/bin/yarn typecheck && docker/bin/yarn lint && docker/bin/yarn vitest run src/app src/lib/setup`, then `docker/bin/yarn test:e2e e2e/find-jobs.spec.ts`. Expected: pass.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(jobs): choose and key SerpApi in Settings and the setup guide"`

---

### Task 3: Remove Adzuna, the Bundesagentur für Arbeit and FreeHire

**Files:**
- Delete: `src/lib/job-search/adzuna.ts`, `adzuna.test.ts`, `arbeitsagentur.ts`, `arbeitsagentur.test.ts`, `freehire.ts`, `freehire.test.ts`, `src/components/arbeitsagentur-note.tsx`
- Create: `prisma/migrations/20261107130000_us_job_sources/migration.sql`, `prisma/sqlite/migrations/20261107130000_us_job_sources/migration.sql`
- Modify: `prisma/schema.prisma`, `prisma/sqlite/schema.prisma`, and everything the compiler then names. The known set: `src/lib/job-search/{adapter,sources,search,index,config,errors,http.test,index.test,search.test,sources.live.test,config.test}.ts`, `src/lib/{env,env.test,settings,settings.test,data-export,data-import}.ts`, `src/lib/data-export.db.test.ts`, `src/lib/data-import.db.test.ts`, `src/lib/agent/run.ts` and its tests, `src/instrumentation.ts`, `src/app/(app)/settings/{actions,job-search-section,agent-section,page}.tsx` and their tests, `src/app/(app)/jobs/{actions.ts,jobs-screen.tsx,page.tsx,posting-results.tsx,search-fields.tsx}`, `src/app/(setup)/welcome/jobs-step.tsx`, `src/lib/setup/{job-choices,job-choices.test}.ts`, `src/components/source-attribution.test.tsx`, `src/test/job-search-fixtures.ts`, `e2e/{fake-jobs.mts,find-jobs.spec.ts}`.

**Interfaces:**
- Produces: `PostingSource = JSEARCH | SERPAPI`; `JOB_SOURCES = [JSEARCH, SERPAPI]`; export file `version: 10` with `jobSourceKeys: { jsearch?, serpapi? }`; a data-import that drops removed-source rows from the file before validating.
- Consumes: Task 1 and 2's SerpApi pieces.

- [ ] **Step 1: Write the failing tests.**
  - `data-import.db.test.ts`, `imports a version 9 export and skips rows from removed sources` (Review Focus 5): a v9 file with `postings`, `searches` and `agentCandidates` in `ADZUNA`/`FREEHIRE`/`ARBEITSAGENTUR` and in `JSEARCH`, plus an application whose posting is an `ADZUNA` one. After import: the JSEARCH rows and the application exist, no removed-source row exists, and the application has no `posting`. Also `jobSourceKeys: { adzuna: "x" }` is ignored without failing.
  - `data-export.db.test.ts`: the export has `version` 10, `jobSourceKeys` carries a saved SerpApi key under `serpapi`, and `SECRET_SETTINGS` contains `serpapiKeyEnc` and not `adzunaKeyEnc`.
  - `settings.test.ts`: the settings schema has no `adzunaAppId`, `adzunaKeyEnc` or `arbeitsagenturAcceptedAt`.
  - `env.test.ts`: `DOSSIER_JOBS_SOURCE=adzuna` (and `arbeitsagentur`, `freehire`) is refused with `DOSSIER_JOBS_SOURCE must be one of jsearch, serpapi, off (got "adzuna").`
  - `agent/run.db.test.ts`, `runs without a source and says to choose one` (Review Focus 4): with `jobSource` saved as `OFF`, a run returns the "Choose a job source in Settings → Job search first." message and writes nothing.
  - The migrations' own cleanup has no Vitest test, because a Vitest run starts after every migration is applied; Steps 6–7 check it on scratch databases instead.
- [ ] **Step 2: Run them to see them fail.** `docker/bin/yarn vitest run src/lib/data-import.db.test.ts src/lib/data-export.db.test.ts src/lib/settings.test.ts src/lib/env.test.ts src/lib/agent`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Change the schema.** Replace the `PostingSource` enum body with `JSEARCH`, `SERPAPI` in `prisma/schema.prisma`; `docker/bin/yarn sqlite-schema && docker/bin/yarn generate`.
- [ ] **Step 4: Remove the code.** Delete the files listed, then run `docker/bin/yarn typecheck` and fix every error it reports, until it is clean. Each remaining reference to a removed source is deleted, not stubbed. In addition (the compiler won't find these): `JOB_SOURCE_NAMES` becomes `["jsearch", "serpapi", "off"]`; the `arbeitsagentur`/`off` cross-check in `env.ts` goes; the FreeHire branch and parameter of `requestContext` go; `arbeitsagenturStartupNotice` and its call in `instrumentation.ts` go; the `"off"`, `"not-accepted"` problems and the Bundesagentur `changed` wording go from `errors.ts`, `SearchProblem` and its handling in the Find jobs screen; `agent/run.ts` loses its Bundesagentur branch and says `Choose JSearch or SerpApi in Settings → Job search for it.`; `JOB_KINDS` loses `"tech"`, leaving `"any"` and `"none"`, with the welcome step defaulting to `"any"`; `jobs-step.tsx` loses the Adzuna app-ID field; the data export `version` becomes 10, `jobSourceKeys` becomes `{ jsearch, serpapi }`, and the import's pre-filter drops rows whose `source` is not in `PostingSource` from `postings`, `searches` and `agentCandidates` before `z.array(...)` runs (e.g. `z.preprocess`).
- [ ] **Step 5: Write the migrations.**
  - Postgres: rename the old type (`ALTER TYPE "PostingSource" RENAME TO "PostingSource_old"`), `CREATE TYPE "PostingSource" AS ENUM ('JSEARCH', 'SERPAPI')`; before altering, `DELETE FROM "Posting"|"PostingSearch"|"PostingScore"|"AgentCandidate" WHERE "source"::text IN ('ADZUNA','ARBEITSAGENTUR','FREEHIRE')`; then `ALTER TABLE … ALTER COLUMN "source" TYPE "PostingSource" USING "source"::text::"PostingSource"` on the four tables; `DROP TYPE "PostingSource_old"`.
  - Both databases: `UPDATE "Setting" SET "value" = 'OFF' WHERE "key" = 'jobSource' AND "value" IN ('ADZUNA','ARBEITSAGENTUR','FREEHIRE')` and `DELETE FROM "Setting" WHERE "key" IN ('adzunaAppId','adzunaKeyEnc','arbeitsagenturAcceptedAt')`. Settings strings are stored plain (`settings.ts` stores non-objects with `String(value)`), so the `value` match is the bare name.
  - SQLite: the same deletes and settings statements with no enum DDL.
  - Check Prisma's own diff is clean: `docker/bin/yarn prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` for Postgres, and `prisma/sqlite/derive.test.ts` for SQLite.
- [ ] **Step 6: Verify the SQLite migration on a scratch file.** In the scratchpad directory, build a database from every SQLite migration except the new one (`DATABASE_URL=file:<scratch>/old.db`, `prisma migrate deploy` with the new folder moved aside), insert with `sqlite3`: one `Posting` per source (`JSEARCH`, `ADZUNA`, `FREEHIRE`) with the ADZUNA one linked to an `Application`, one `AgentCandidate` and `PostingScore` and `PostingSearch` per source, and settings rows `jobSource=ADZUNA`, `adzunaAppId=x`, `adzunaKeyEnc=y`, `arbeitsagenturAcceptedAt=z`. Move the folder back, `migrate deploy`, and query. Expected: only the `JSEARCH` rows remain in the four tables, the `Application` row remains with `Posting.applicationId` gone, `jobSource` is `OFF`, the three settings rows are gone.
- [ ] **Step 7: Verify the Postgres migration the same way** in a scratch database (`CREATE DATABASE dossier_scratch` on the compose Postgres, migrate to the previous migration, seed the same rows with `psql`, apply the new one, query, then `DROP DATABASE dossier_scratch`). Expected: the same results, and `\dT+ "PostingSource"` lists exactly `JSEARCH` and `SERPAPI`.
- [ ] **Step 8: Run everything.** `docker/bin/yarn typecheck && docker/bin/yarn lint && docker/bin/yarn test`, then `docker/bin/yarn test:e2e e2e/find-jobs.spec.ts e2e/setup-guide.spec.ts e2e/agent.spec.ts`. Expected: all pass, with no skipped-by-mistake tests: compare the test count against Step 1 of Task 1, and every drop must be one of the deleted adapters' tests.
- [ ] **Step 9: Search for leftovers.** `grep -rniE "adzuna|arbeitsagentur|freehire|bundesagentur" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .` must find only the two migrations' SQL, the migration history, and this task's removed-source test fixtures for the import. Anything else is removed.
- [ ] **Step 10: Commit.** `git add -A && git commit -m "feat(jobs)!: remove Adzuna, Bundesagentur für Arbeit and FreeHire, with their stored data"`

---

### Task 4: Docs, compose and env files

**Files:**
- Modify: `.env.example`, `compose.production.yml`, `compose.jetson.yml`, `PRIVACY.md`, `DEVELOPMENT.md`, `README.md`, `site/index.html`, `SECURITY.md` where they name a removed source

**Interfaces:**
- Consumes: the final env names and copy from Global Constraints.

- [ ] **Step 1: Update the files.** `.env.example`: the job-search block lists `jsearch`, `serpapi`, `off`, with `DOSSIER_SERPAPI_KEY=` and no Adzuna, FreeHire or Bundesagentur lines. Both compose files drop the four removed variables and gain `DOSSIER_SERPAPI_KEY`. `PRIVACY.md`: the job source is JSearch or SerpApi, and says what each receives (the search's keywords, place and filters; nothing from the profile). `DEVELOPMENT.md`: the live-test commands become `JOBS_LIVE=jsearch` and `JOBS_LIVE=serpapi -e SERPAPI_TEST_KEY=…`, and a line says that a `DOSSIER_JOBS_SOURCE` naming a removed source now stops the server at start with the "must be one of" message. `README.md` and `site/index.html`: remove the removed sources and say SerpApi where sources are listed.
- [ ] **Step 2: Check.** `docker/bin/yarn vitest run src/lib/no-upstream.test.ts src/lib/env.test.ts` passes; `grep -rniE "adzuna|arbeitsagentur|freehire|bundesagentur" .env.example compose*.yml *.md site` finds nothing outside the migration notes.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "docs: job sources are JSearch and SerpApi"`

---

### Task 5: SerpApi live test and final verification

**Files:**
- Create: `src/lib/job-search/serpapi.live.test.ts`
- Modify: `src/test/job-search-fixtures.ts` (fixtures from the probe), `src/lib/job-search/serpapi.ts` (error mapping, if the probe differs)

- [ ] **Step 1: Write the live test** after `jsearch.live.test.ts`: skipped unless `JOBS_LIVE=serpapi` and `SERPAPI_TEST_KEY` are set; one search for `developer` in `us`, asserting at least one posting with a title, a company and an `http(s)` URL; then a deliberately wrong key, asserting `JobSearchError` problem `key`. Run it with no key and confirm it is reported as skipped.
- [ ] **Step 2: Ask the user for a SerpApi key**, or to skip. With a key (it spends 2 of the 250 monthly searches): run `docker compose exec -e JOBS_LIVE=serpapi -e SERPAPI_TEST_KEY=… app yarn vitest run src/lib/job-search/serpapi.live.test.ts`. Record the real shapes of: a normal answer, the no-results answer, the wrong-key answer, and (if reachable) the out-of-searches answer. Replace the Task 1 fixtures with them, correct `serpapi.ts`'s mapping where they differ, and keep the key out of the files. Without a key, leave the Task 1 fixtures and report in the summary that SerpApi's error shapes are unverified.
- [ ] **Step 3: Full verification.** `docker/bin/yarn typecheck && docker/bin/yarn lint && docker/bin/yarn test && docker/bin/yarn test:e2e`. Expected: all pass. Then start the app against a scratch database, open Settings → Job search and Find jobs, and confirm Off is shown on a database that had `jobSource` set to a removed source, and that choosing SerpApi with the e2e fake key lists the fake posting.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "test(jobs): SerpApi live test"`
