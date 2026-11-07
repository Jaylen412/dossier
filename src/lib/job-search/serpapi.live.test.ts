import { describe, expect, it } from "vitest";

import { JobSearchError } from "./errors";
import { serpapi } from "./serpapi";
import { EMPTY_QUERY } from "./search";

// Checks against the real SerpApi API, skipped unless asked for. Each run
// spends two searches from the plan:
//
//   JOBS_LIVE=serpapi SERPAPI_TEST_KEY=… docker/bin/yarn vitest run src/lib/job-search/serpapi.live.test.ts

const live = new Set((process.env.JOBS_LIVE ?? "").split(",").map((name) => name.trim()));
const key = process.env.SERPAPI_TEST_KEY ?? "";

// Two searches, each of which may take up to the request timeout.
describe.runIf(live.has("serpapi") && key)("SerpApi (live)", { timeout: 60_000 }, () => {
  it("finds postings for a keyword in the US, each with a title, a company and a link", async () => {
    const query = { ...EMPTY_QUERY, keywords: "developer", country: "us" };
    const page = await serpapi.search(query, { key }, null);
    expect(page.postings.length).toBeGreaterThan(0);
    for (const posting of page.postings) {
      expect(posting.title).not.toBe("");
      expect(posting.company).not.toBe("");
      expect(posting.url).toMatch(/^https?:\/\//);
    }
  });

  it("refuses a wrong key as a key problem", async () => {
    const query = { ...EMPTY_QUERY, keywords: "developer", country: "us" };
    const error = await serpapi.search(query, { key: "not-a-real-key" }, null).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JobSearchError);
    expect(error).toMatchObject({ problem: "key" });
  });
});
