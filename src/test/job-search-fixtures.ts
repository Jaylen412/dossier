// Answers from job sources for the tests (E14), in each source's own shape,
// with made-up companies and people.

const ledgerly = {
  job_id: "aG9tZWQtZGVzaWduZXItbGVkZ2VybHk=",
  job_title: "Senior Product Designer, Payments",
  employer_name: "Ledgerly",
  employer_logo: "https://example.com/ledgerly.png",
  job_publisher: "LinkedIn",
  job_employment_type: "Full-time",
  job_apply_link: "https://www.linkedin.com/jobs/view/1234567890?utm_source=google_jobs_apply",
  job_apply_is_direct: false,
  apply_options: [
    { publisher: "LinkedIn", apply_link: "https://www.linkedin.com/jobs/view/1234567890?utm_source=google_jobs_apply", is_direct: false },
    { publisher: "Ledgerly Careers", apply_link: "https://careers.ledgerly.example/jobs/42", is_direct: true },
  ],
  job_description: "Ledgerly is hiring a Senior Product Designer for its payments team.\n\nYou'll design checkout flows.\n\n• 5+ years of product design\n• Figma",
  job_is_remote: false,
  job_posted_at_datetime_utc: "2026-09-30T08:00:00.000Z",
  job_posted_at_timestamp: 1790755200,
  // As JSearch writes it: in the country's language, with the publisher.
  job_location: "Hamburg     •  über LinkedIn",
  job_city: null,
  job_state: null,
  job_country: "DE",
  job_latitude: 53.55,
  job_longitude: 9.99,
  job_min_salary: 75000,
  job_max_salary: 90000,
  job_salary_currency: "EUR",
  job_salary_period: "YEAR",
  job_google_link: "https://www.google.com/search?q=jobs&ibp=htl;jobs#htidocid=abc",
};

const northwind = {
  job_id: "bm9ydGh3aW5kLXV4LXJlc2VhcmNo",
  job_title: "UX Researcher",
  employer_name: "Northwind Studio",
  job_publisher: "Indeed",
  job_apply_link: "https://de.indeed.com/viewjob?jk=abc123&from=serp",
  apply_options: [{ publisher: "Indeed", apply_link: "https://de.indeed.com/viewjob?jk=abc123&from=serp", is_direct: false }],
  job_description: "Northwind Studio is looking for a UX Researcher, fully remote within Germany.",
  job_is_remote: true,
  job_posted_at_datetime_utc: null,
  job_posted_at_timestamp: 1790582400,
  job_location: null,
  job_city: "Berlin",
  job_state: null,
  job_country: "DE",
  job_min_salary: null,
  job_max_salary: null,
  job_salary_currency: null,
  job_salary_period: null,
};

/** OpenWeb Ninja's search-v2: jobs and the next page's cursor under `data`. */
export const jsearchV2Page = {
  status: "OK",
  request_id: "c8f1b2a4-0000-4000-8000-000000000001",
  parameters: { query: "product designer in Hamburg", country: "de" },
  data: {
    jobs: [
      ledgerly,
      northwind,
      // Repeated across publishers: kept once.
      ledgerly,
      // Without an id: skipped.
      { job_title: "No id" },
    ],
    cursor: "CURSOR-PAGE-2",
  },
};

/** The last search-v2 page: no cursor. */
export const jsearchV2LastPage = { status: "OK", request_id: "r2", parameters: {}, data: { jobs: [northwind], cursor: null } };

/** What JSearch says to a key it doesn't know. */
export const jsearchKeyError = { status: "ERROR", request_id: "r4", error: { message: "Invalid API key", code: 401 } };

// SerpApi's google_jobs answers, from SerpApi's documentation; replaced by a
// live probe in Task 5 of the US job sources plan.

/** A page of Google Jobs results: one with apply options and details, one with only a share link, one with no details. */
export const serpapiPage = {
  search_metadata: { id: "s1", status: "Success", google_jobs_url: "https://www.google.com/search?q=product+designer&ibp=htl;jobs" },
  search_parameters: { engine: "google_jobs", q: "product designer in Hamburg", gl: "de", hl: "en" },
  jobs_results: [
    {
      title: "Senior Product Designer, Payments",
      company_name: "Ledgerly",
      location: "Hamburg, Germany",
      via: "via LinkedIn",
      share_link: "https://www.google.com/search?q=product+designer&ibp=htl;jobs#htidocid=ledgerly",
      extensions: ["3 days ago", "$90K–$120K a year", "Work from home", "Full-time"],
      detected_extensions: { posted_at: "3 days ago", salary: "$90K–$120K a year", work_from_home: true, schedule_type: "Full-time" },
      description: "Ledgerly is hiring a Senior Product Designer for its payments team.\n\nYou'll design checkout flows.",
      apply_options: [
        { title: "Apply on javascript", link: "javascript:alert(1)" },
        { title: "Apply on LinkedIn", link: "https://www.linkedin.com/jobs/view/1234567890" },
        { title: "Apply on Ledgerly Careers", link: "https://careers.ledgerly.example/jobs/42" },
      ],
      job_id: "eyJqb2JfdGl0bGUiOiJsZWRnZXJseSJ9",
    },
    {
      title: "UX Researcher",
      company_name: "Northwind Studio",
      location: "Berlin, Germany",
      via: "via Indeed",
      share_link: "https://www.google.com/search?q=ux+researcher&ibp=htl;jobs#htidocid=northwind",
      extensions: ["Full-time"],
      detected_extensions: { schedule_type: "Full-time" },
      description: "Northwind Studio is looking for a UX Researcher.",
      job_id: "eyJqb2JfdGl0bGUiOiJub3J0aHdpbmQifQ==",
    },
    {
      title: "Design Systems Designer",
      company_name: "Canal Software",
      location: "Amsterdam, Netherlands",
      via: "via Company site",
      share_link: "https://www.google.com/search?q=design+systems&ibp=htl;jobs#htidocid=canal",
      description: "",
      job_id: "eyJqb2JfdGl0bGUiOiJjYW5hbCJ9",
    },
    // Repeated across pages: kept once.
    { title: "Repeat", job_id: "eyJqb2JfdGl0bGUiOiJsZWRnZXJseSJ9" },
    // Without an id: skipped.
    { title: "No id", company_name: "Nowhere" },
  ],
  serpapi_pagination: { next_page_token: "tok-1" },
};

/** The last page: no pagination. */
export const serpapiLastPage = { search_parameters: { engine: "google_jobs" }, jobs_results: [serpapiPage.jobs_results[1]] };

/** What SerpApi answers, with HTTP 200, when Google has no jobs for the search. */
export const serpapiNoResults = { search_metadata: { id: "s2", status: "Success" }, error: "Google hasn't returned any results for this query." };
