import type { JobSource } from "@/lib/job-search/search";
import { SOURCE_INFO } from "@/lib/job-search/sources";

import { WIKI, type Instruction } from "./instructions";

// The setup guide's job search step (E21-3): what kind of jobs, then the
// source for it, with how to get its free key.

export type JobKind = "any" | "none";

export const JOB_KINDS: readonly { value: JobKind; name: string; description: string }[] = [
  { value: "any", name: "Any kind of job", description: "Every field, from the big job sites. Needs a free key, which takes a few minutes to get." },
  { value: "none", name: "None for now", description: "You'll paste the postings you find yourself. Find jobs stays off until you choose a source in Settings." },
];

export type JobChoice = {
  source: JobSource;
  kind: Exclude<JobKind, "none">;
  name: string;
  about: string;
  cost: string;
  steps: readonly Instruction[];
};

export const JOB_CHOICES: readonly JobChoice[] = [
  {
    source: "JSEARCH",
    kind: "any",
    name: "JSearch",
    about: "Postings from LinkedIn, Indeed, Glassdoor and company sites, through Google for Jobs, in most countries.",
    cost: "A free plan with a small number of searches each month, and no card. Its page shows how many.",
    steps: [
      { text: "Sign up on OpenWeb Ninja's developer portal and choose JSearch's free plan.", link: { href: "https://app.openwebninja.com", label: "OpenWeb Ninja" } },
      { text: "Copy your API key and paste it below." },
    ],
  },
  {
    source: "SERPAPI",
    kind: "any",
    name: "SerpApi",
    about: SOURCE_INFO.SERPAPI.description,
    cost: "A free plan of 250 searches a month, no card needed. Paid plans start at $25 for 1,000.",
    steps: [
      { text: "Sign up for SerpApi's free plan.", link: { href: "https://serpapi.com/users/sign_up", label: "SerpApi's sign-up" } },
      { text: "Copy the API key from your account's dashboard and paste it below." },
    ],
  },
];

export const JOB_SOURCES_HELP = `${WIKI}/Choosing-a-job-source`;
