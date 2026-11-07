import { globSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

// This fork sends nothing to the upstream project: no usage ping, update
// check or notices. Any merge from upstream that brings one back names one of
// these, and fails here. Links the user clicks (the repository, the wiki) are
// fine: the server never asks github.com for anything.
const UPSTREAM = [
  /aien\.me/i, // the project's backend, its usage ping receiver and its website
  /api\.github\.com/i, // the update check asked it for the latest release
  /dossier\.app@pm\.me/i, // the usage ping's controller
];

const sources = [
  ...globSync("src/**/*.{ts,tsx,mts,js,mjs,json}"),
  ...globSync("prisma/**/*.{ts,sql,json}"),
  ...globSync("docker/**/*"),
  "Dockerfile",
  "next.config.ts",
].filter((file) => statSync(file).isFile() && !/\.test\.tsx?$/.test(file) && !file.startsWith("src/generated/"));

describe("nothing upstream", () => {
  it("finds the sources", () => {
    expect(sources.length).toBeGreaterThan(300);
  });

  it("names no upstream address the server could reach", () => {
    const found = sources.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return UPSTREAM.filter((pattern) => pattern.test(source)).map((pattern) => `${file}: ${pattern.source}`);
    });
    expect(found).toEqual([]);
  });
});
