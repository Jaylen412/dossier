import "server-only";

import { z } from "zod";

import type { JobSourceAdapter, RequestContext, SourceCredentials } from "./adapter";
import { jobSearchError } from "./errors";
import { requestJson } from "./http";
import { POSTED_WITHIN, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";

// SerpApi (US job sources): Google for Jobs through SerpApi's google_jobs
// engine, a US service. One search page is one search from the plan (250 a
// month free), ten results, paged by a token. The key is a query parameter,
// so it sits in the request URL: errors name the path, never the URL.

const SEARCH_URL = "https://serpapi.com/search.json";

// Every field may be missing or null; one odd field doesn't drop the posting.
const maybeText = z.string().nullish().catch(null);
const maybeFlag = z.boolean().nullish().catch(null);

const jobSchema = z.object({
  job_id: z.string().min(1),
  title: maybeText,
  company_name: maybeText,
  location: maybeText,
  via: maybeText,
  share_link: maybeText,
  description: maybeText,
  apply_options: z.array(z.object({ title: maybeText, link: maybeText })).nullish().catch(null),
  detected_extensions: z.object({ posted_at: maybeText, salary: maybeText, work_from_home: maybeFlag }).nullish().catch(null),
});
type Job = z.output<typeof jobSchema>;

const responseSchema = z.object({
  jobs_results: z.array(z.unknown()).nullish(),
  serpapi_pagination: z.object({ next_page_token: z.string().nullish() }).nullish().catch(null),
  error: z.string().nullish().catch(null),
});

const DAYS_IN: Record<string, number> = { minute: 0, hour: 0, day: 1, week: 7, month: 30 };

/**
 * How many days old a posting is, from the text Google writes ("3 days ago",
 * "Just posted", "30+ days ago"); null when it isn't one of those. "30+"
 * counts as one day more than it says, so it never fits a month.
 */
export function postedAgeDays(text: string | null | undefined): number | null {
  const written = text?.trim().toLowerCase();
  if (!written) return null;
  if (written === "just posted" || written === "today") return 0;
  const match = /^(\d+)(\+?)\s*(minute|hour|day|week|month)s?\s+ago$/.exec(written);
  if (!match) return null;
  const [, count, plus, unit] = match;
  return Number(count) * DAYS_IN[unit] + (plus ? 1 : 0);
}

/** The first apply link that's a web address, else Google's own link to the posting. */
function linkOf(job: Job): string {
  for (const option of job.apply_options ?? []) {
    const link = safeLink(option.link);
    if (link) return link;
  }
  return safeLink(job.share_link);
}

export function postingFromJob(job: Job, now: Date): FoundPosting {
  const description = (job.description ?? "").trim().slice(0, 100_000);
  const age = postedAgeDays(job.detected_extensions?.posted_at);
  return {
    source: "SERPAPI",
    externalId: job.job_id.slice(0, 500),
    title: (job.title ?? "").trim().slice(0, 500),
    company: (job.company_name ?? "").trim().slice(0, 300),
    place: (job.location ?? "").trim().slice(0, 300),
    remote: job.detected_extensions?.work_from_home ?? null,
    salary: (job.detected_extensions?.salary ?? "").trim().slice(0, 200),
    postedAt: age === null ? null : new Date(now.getTime() - age * 86_400_000).toISOString(),
    url: linkOf(job).slice(0, 2000),
    // Google writes "via LinkedIn"; the screen adds the "via".
    via: (job.via ?? "").trim().replace(/^via\s+/i, "").slice(0, 100),
    description,
    complete: description.length > 0,
  };
}

/**
 * " (keys: jobs_results, error)" for an answer that's an object: its top-level
 * keys tell a changed API from an error message, and never hold the search
 * the way values can.
 */
function keysOf(answer: unknown): string {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return "";
  const keys = Object.keys(answer).slice(0, 10).map((key) => key.slice(0, 40));
  return keys.length > 0 ? ` (keys: ${keys.join(", ")})` : "";
}

/** "designer in Hamburg": Google reads the place from the query text. */
function queryText({ keywords, place }: SearchQuery): string {
  return place ? `${keywords} in ${place}` : keywords;
}

function searchUrl(query: SearchQuery, key: string, next: string | null, baseUrl?: string): URL {
  const url = new URL(baseUrl ? `${baseUrl}/search.json` : SEARCH_URL);
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", queryText(query));
  // Without a country, Google searches the US.
  url.searchParams.set("gl", query.country || "us");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", key);
  if (next?.startsWith("token:")) url.searchParams.set("next_page_token", next.slice("token:".length));
  return url;
}

async function searchPage(query: SearchQuery, { key }: SourceCredentials["SERPAPI"], next: string | null, context: RequestContext = {}): Promise<SearchPage> {
  const url = searchUrl(query, key, next, context.baseUrl);
  const raw = await requestJson("SERPAPI", url, { signal: context.signal });
  const answer = responseSchema.safeParse(raw);
  if (!answer.success) throw jobSearchError("changed", "SERPAPI", { detail: `${url.pathname}: unexpected answer${keysOf(raw)}` });

  const { jobs_results: results, serpapi_pagination: pagination, error } = answer.data;
  if (error) {
    // A search Google has no jobs for is answered with HTTP 200 and this text; any other error is not a search.
    if (/hasn.t returned any results/i.test(error)) return { postings: [], next: null };
    throw jobSearchError("changed", "SERPAPI", { detail: `${url.pathname}: error answer` });
  }
  if (!results) throw jobSearchError("changed", "SERPAPI", { detail: `${url.pathname}: unexpected answer${keysOf(raw)}` });

  // The most days old a posting may be; Google's own filter can't be asked for here, so it's applied to what's read.
  const maxDays = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days ?? null;
  const now = new Date();
  const seen = new Set<string>();
  const postings: FoundPosting[] = [];
  for (const item of results) {
    const job = jobSchema.safeParse(item);
    if (!job.success || seen.has(job.data.job_id)) continue;
    seen.add(job.data.job_id);
    // One whose age isn't known stays, as does any when the search is for any time.
    const age = postedAgeDays(job.data.detected_extensions?.posted_at);
    if (maxDays !== null && age !== null && age > maxDays) continue;
    postings.push(postingFromJob(job.data, now));
  }

  const token = pagination?.next_page_token;
  return { postings, next: token ? `token:${token}` : null };
}

export const serpapi: JobSourceAdapter<"SERPAPI"> = {
  source: "SERPAPI",
  search: searchPage,
  // Search results carry the whole description.
  details: async (posting) => (posting.description ? posting.description : null),
  test: async (credentials, context) => {
    await searchPage({ keywords: "developer", place: "", country: "us", radiusKm: 25, remoteOnly: false, postedWithin: "any" }, credentials, null, context);
  },
};
