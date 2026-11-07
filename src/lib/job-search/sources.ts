import type { JobSource, JSearchHost } from "./search";

/** What Settings → Job search may know about a source's key: never the key itself. "env" means it comes from the environment. */
export type JobKeyState = "none" | "set" | "unreadable" | "env";

/** What the Job search section starts from (E14-4). */
export type JobSearchSettingsView = {
  source: JobSource | "OFF";
  jsearch: { host: JSearchHost; keyState: JobKeyState };
  serpapi: { keyState: JobKeyState };
};

/** Where to get a JSearch key, by where it's from. */
export const JSEARCH_KEY_URLS: Record<JSearchHost, string> = {
  openwebninja: "https://www.openwebninja.com/api/jsearch",
  rapidapi: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
};

/** How Settings → Job search and the Find jobs screen describe each source (E14). */
export type SourceInfo = {
  name: string;
  /** What it covers, in a line. */
  description: string;
  /** Cost and reach at a glance. */
  tag: string;
  /** Where to get a key; null when none is needed. */
  keyUrl: string | null;
  /** When used-up searches come back: "this month", "today"; null when there's no quota. */
  quotaPeriod: string | null;
  /** Shown with its results, as the source's terms ask. */
  attribution: string | null;
  /**
   * Where the attribution links, when the terms ask for a link: the source's
   * site for the posting's country when its link is on one (`local`), else
   * `home`. Null for a plain-text attribution.
   */
  attributionLink: { home: string; local: RegExp } | null;
  /** The countries it lists jobs in (ISO codes); null for every country. */
  countries: readonly string[] | null;
  /** Whether it looks within a distance of the place; without, the place only puts postings there first. */
  radius: boolean;
};

export const SOURCE_INFO: Record<JobSource, SourceInfo> = {
  JSEARCH: {
    name: "JSearch",
    description: "Postings from LinkedIn, Indeed, Glassdoor and company sites, through Google for Jobs.",
    tag: "Most countries · free plan with a few searches a month",
    keyUrl: "https://www.openwebninja.com/api/jsearch",
    quotaPeriod: "this month",
    attribution: null,
    attributionLink: null,
    countries: null,
    radius: true,
  },
  SERPAPI: {
    name: "SerpApi",
    description: "Postings from LinkedIn, Indeed, Glassdoor and company sites, through Google for Jobs, from a US service.",
    tag: "Most countries · 250 free searches a month",
    keyUrl: "https://serpapi.com/users/sign_up",
    quotaPeriod: "this month",
    attribution: null,
    attributionLink: null,
    countries: null,
    radius: false,
  },
};

/** Whether a source lists jobs in a country ("us"). */
export function sourceCovers(source: JobSource, country: string): boolean {
  const countries = SOURCE_INFO[source].countries;
  return countries === null || countries.includes(country);
}

/** Where a posting's attribution links (the source's site for the posting's country, when it has one); null when it's plain text. */
export function attributionHref(source: JobSource, postingUrl: string): string | null {
  const link = SOURCE_INFO[source].attributionLink;
  if (!link) return null;
  const host = URL.canParse(postingUrl) ? new URL(postingUrl) : null;
  return host?.protocol === "https:" && link.local.test(host.hostname) ? host.origin : link.home;
}
