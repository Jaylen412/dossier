import { describe, expect, it } from "vitest";

import { matchStartup, whereText } from "./match";
import { placeOf } from "./place";
import type { FoundStartup } from "./types";

const now = new Date("2026-10-23T12:00:00Z");
const profile = {
  basics: { headline: "Android engineer", summary: "", city: "Austin", country: "United States" },
  skills: [
    { id: "1", name: "Kotlin" },
    { id: "2", name: "Android" },
    { id: "3", name: "Jetpack Compose" },
    { id: "4", name: "Git" },
  ],
  experience: [],
} as unknown as Parameters<typeof matchStartup>[1];
const austin = placeOf(profile.basics);
const startup = (change: Partial<FoundStartup> = {}): FoundStartup => ({
  source: "HN",
  externalId: "1",
  company: "Acme",
  website: "",
  summary: "We build farm software",
  details: "Acme | Android Engineer | Austin, Texas | Onsite\nWe use Kotlin and Jetpack Compose.",
  location: "Austin, Texas",
  remote: false,
  stage: "",
  roles: ["Android Engineer"],
  emails: [],
  links: [],
  postedAt: "2026-10-20T12:00:00Z",
  ...change,
});

describe("matching startups against the profile (#222)", () => {
  it("scores skills, the kind of work, the place and freshness, and says why", () => {
    const fit = matchStartup(startup(), profile, austin, now);
    expect(fit.reasons).toEqual(["Mentions Kotlin, Android and Jetpack Compose from your skills", "Hires for mobile work, like yours", "In Austin", "Posted 3 days ago"]);
    expect(fit.score).toBe(10 + 29 + 15 + 20 + 10);
  });

  it("ignores skills too general to mean anything", () => {
    expect(matchStartup(startup({ details: "We use Git.", roles: [], summary: "" }), profile, austin, now).reasons).not.toContainEqual(expect.stringMatching(/Git/));
  });

  it("counts remote work by whether it's open to the profile's country", () => {
    const remote = (where: string) => matchStartup(startup({ location: "", details: `Acme | Engineer | ${where}` }), profile, austin, now).reasons;
    expect(remote("REMOTE (US)")).toContain("Remote, open to United States");
    expect(remote("REMOTE")).toContain("Remote (where from isn't said)");
    expect(remote("Phoenix, USA")).toContain("In United States");
  });

  it("adds YC startups, older posts and an address for applications", () => {
    const fit = matchStartup(
      startup({ source: "YC", summary: "Acme (YC W24) Is Hiring", details: "", location: "", stage: "YC W24", postedAt: "2026-09-23T12:00:00Z", emails: [{ email: "jobs@acme.com", label: "Hiring", from: "", onRequest: false, foundAt: "" }] }),
      profile,
      austin,
      now,
    );
    expect(fit.reasons).toEqual(["Mentions Android from your skills", "Hires for mobile work, like yours", "A YC W24 startup", "Publishes an address for applications"]);
    expect(fit.score).toBe(10 + 12 + 15 + 5 + 5 + 5);
  });

  it("reads where a YC post hires from its title, and a hiring post from its first line", () => {
    expect(whereText(startup({ source: "YC", location: "SF", summary: "Acme (YC W24) Is Hiring in SF" }))).toBe("SF | Acme (YC W24) Is Hiring in SF");
    expect(whereText(startup())).toBe("Austin, Texas | Acme | Android Engineer | Austin, Texas | Onsite");
  });

  it("stays between 0 and 100, with no reasons for a poor fit", () => {
    const fit = matchStartup(startup({ details: "Bakery", summary: "", roles: [], location: "", postedAt: null }), profile, placeOf({ city: "", country: "" }), now);
    expect(fit).toEqual({ score: 10, reasons: [] });
  });
});
