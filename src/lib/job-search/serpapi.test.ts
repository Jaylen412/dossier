import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { json, refused, stubFetch } from "@/lib/ai/test-http";
import { serpapiLastPage, serpapiNoResults, serpapiPage } from "@/test/job-search-fixtures";

import { JobSearchError } from "./errors";
import { EMPTY_QUERY, type PostedWithin, type SearchQuery } from "./search";
import { postedAgeDays, serpapi } from "./serpapi";

const query: SearchQuery = { ...EMPTY_QUERY, keywords: "product designer", place: "Hamburg", country: "de", postedWithin: "week" };
const credentials = { key: "serp_test" };

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A page with one posting per `posted_at` text. */
const pageWithAges = (ages: (string | undefined)[]) => ({
  jobs_results: ages.map((posted_at, index) => ({
    job_id: `job-${index}`,
    title: `Job ${index}`,
    ...(posted_at === undefined ? {} : { detected_extensions: { posted_at } }),
  })),
});

describe("SerpApi search", () => {
  it("asks google_jobs with the key, query text, country and language", async () => {
    const requests = stubFetch(() => json(serpapiPage));
    await serpapi.search(query, credentials, null);
    const [{ url }] = requests;
    expect(`${url.origin}${url.pathname}`).toBe("https://serpapi.com/search.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      engine: "google_jobs",
      q: "product designer in Hamburg",
      gl: "de",
      hl: "en",
      api_key: "serp_test",
    });
  });

  it("searches the US when no country is chosen", async () => {
    const requests = stubFetch(() => json(serpapiLastPage));
    await serpapi.search({ ...query, country: "", place: "" }, credentials, null);
    expect(requests[0].url.searchParams.get("gl")).toBe("us");
    expect(requests[0].url.searchParams.get("q")).toBe("product designer");
  });

  it("pages with next_page_token", async () => {
    const requests = stubFetch(() => json(serpapiPage));
    const first = await serpapi.search(query, credentials, null);
    expect(first.next).toBe("token:tok-1");
    expect(requests[0].url.searchParams.has("next_page_token")).toBe(false);

    const later =stubFetch(() => json(serpapiLastPage));
    const last = await serpapi.search(query, credentials, first.next);
    expect(later[0].url.searchParams.get("next_page_token")).toBe("tok-1");
    expect(last.next).toBeNull();
  });

  it("reads a posting from a result", async () => {
    const now = new Date("2026-11-07T12:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    stubFetch(() => json(serpapiPage));
    const { postings } = await serpapi.search(query, credentials, null);
    expect(postings[0]).toEqual({
      source: "SERPAPI",
      externalId: "eyJqb2JfdGl0bGUiOiJsZWRnZXJseSJ9",
      title: "Senior Product Designer, Payments",
      company: "Ledgerly",
      place: "Hamburg, Germany",
      remote: true,
      salary: "$90K–$120K a year",
      postedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      // The first apply link that's a web address.
      url: "https://www.linkedin.com/jobs/view/1234567890",
      via: "LinkedIn",
      description: expect.stringContaining("Senior Product Designer for its payments team"),
      complete: true,
    });
    expect(postings[1]).toMatchObject({ remote: null, salary: "", postedAt: null, complete: true });
    expect(postings[2]).toMatchObject({ description: "", complete: false });
  });

  it("falls back to share_link when there is no apply link", async () => {
    stubFetch(() => json(serpapiPage));
    const { postings } = await serpapi.search(query, credentials, null);
    expect(postings[1].url).toBe("https://www.google.com/search?q=ux+researcher&ibp=htl;jobs#htidocid=northwind");
  });

  it("skips results without a job_id and duplicates", async () => {
    stubFetch(() => json(serpapiPage));
    const { postings } = await serpapi.search(query, credentials, null);
    expect(postings.map((posting) => posting.title)).toEqual(["Senior Product Designer, Payments", "UX Researcher", "Design Systems Designer"]);
  });

  it.each([
    ["week", ["3 days ago", "1 week ago", "Just posted", undefined, "2 weeks ago"], ["3 days ago", "1 week ago", "Just posted", undefined]],
    ["month", ["1 month ago", "30+ days ago", "5 hours ago", undefined], ["1 month ago", "5 hours ago", undefined]],
    ["day", ["today", "1 day ago", "2 days ago"], ["today", "1 day ago"]],
    ["any", ["30+ days ago", "2 weeks ago", "Just posted", undefined], ["30+ days ago", "2 weeks ago", "Just posted", undefined]],
  ] as [PostedWithin, (string | undefined)[], (string | undefined)[]][])(
    "keeps only postings within the asked recency by their posted_at text (%s)",
    async (postedWithin, ages, kept) => {
      stubFetch(() => json(pageWithAges(ages)));
      const { postings } = await serpapi.search({ ...query, postedWithin }, credentials, null);
      expect(postings.map((posting) => ages[Number(posting.externalId.slice("job-".length))])).toEqual(kept);
    },
  );

  it("keeps a posting whose posted_at it can't read", async () => {
    stubFetch(() => json(pageWithAges(["yesterday-ish"])));
    const { postings } = await serpapi.search(query, credentials, null);
    expect(postings).toHaveLength(1);
    expect(postings[0].postedAt).toBeNull();
  });
});

describe("postedAgeDays", () => {
  it.each([
    ["Just posted", 0],
    ["today", 0],
    ["5 hours ago", 0],
    ["20 minutes ago", 0],
    ["1 day ago", 1],
    ["3 days ago", 3],
    ["2 weeks ago", 14],
    ["1 month ago", 30],
    ["30+ days ago", 31],
    ["yesterday-ish", null],
    ["", null],
    [null, null],
    [undefined, null],
  ] as const)("reads %j as %j", (text, days) => {
    expect(postedAgeDays(text)).toBe(days);
  });
});

describe("SerpApi problems", () => {
  it("answers an empty page when Google had no results", async () => {
    stubFetch(() => json(serpapiNoResults));
    await expect(serpapi.search(query, credentials, null)).resolves.toEqual({ postings: [], next: null });
  });

  it("calls any other error answer a change", async () => {
    stubFetch(() => json({ error: "Something else" }));
    const error = await serpapi.search(query, credentials, null).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JobSearchError);
    expect(error).toMatchObject({ problem: "changed" });
  });

  it("says the source changed when the answer has an unknown shape", async () => {
    stubFetch(() => json({ results: [] }));
    await expect(serpapi.search(query, credentials, null)).rejects.toMatchObject({
      problem: "changed",
      detail: "SERPAPI: /search.json: unexpected answer (keys: results)",
    });
  });

  it.each([
    [401, "key"],
    [429, "quota"],
    [503, "unavailable"],
  ] as const)("turns HTTP %i into a %s problem, and the key is never in the error", async (status, problem) => {
    stubFetch(() => json({ error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" }, { status }));
    const error = await serpapi.search(query, credentials, null).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "JobSearchError", problem });
    const { message, detail } = error as JobSearchError;
    expect(message).not.toContain("serp_test");
    expect(detail).not.toContain("serp_test");
  });

  it("leaves the key out of the detail when it can't be reached", async () => {
    stubFetch(refused);
    const error = await serpapi.search(query, credentials, null).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ problem: "unavailable", detail: "SERPAPI: /search.json: ECONNREFUSED" });
    expect((error as JobSearchError).detail).not.toContain("serp_test");
  });

  it("says the quota's used up in its own words", async () => {
    stubFetch(() => json({}, { status: 429 }));
    await expect(serpapi.search(query, credentials, null)).rejects.toMatchObject({
      message: "You've used up your SerpApi searches for this month. Try again then, or move to a bigger plan.",
    });
  });
});

describe("SerpApi details and test", () => {
  it("has the whole description already, so details never asks again", async () => {
    const requests = stubFetch(() => json(serpapiPage));
    const [posting] = (await serpapi.search(query, credentials, null)).postings;
    expect(await serpapi.details(posting, credentials)).toBe(posting.description);
    expect(await serpapi.details({ ...posting, description: "" }, credentials)).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it("tests the key with one search", async () => {
    const requests = stubFetch(() => json(serpapiLastPage));
    await expect(serpapi.test(credentials)).resolves.toBeUndefined();
    expect(requests).toHaveLength(1);
  });
});
