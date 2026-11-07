import { describe, expect, it, vi } from "vitest";

import { encryptSecret, JOB_SOURCE_KEY } from "@/lib/secrets";

import { credentialsFor, jobSearchView, requestContext, resolveJobSearchConfig } from "./config";

vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "a".repeat(32) } }));

const nothingSaved = {
  jobSource: null,
  jsearchKeyEnc: null,
  jsearchHost: "openwebninja" as const,
  serpapiKeyEnc: null,
};
const noEnv = {};

describe("resolveJobSearchConfig", () => {
  it("is off until a source is chosen", () => {
    const config = resolveJobSearchConfig(nothingSaved, noEnv);
    expect(config).toMatchObject({ source: null, saved: false, jsearch: { key: null, keyState: "none" }, serpapi: { key: null, keyState: "none" } });
    expect(jobSearchView(config)).toEqual({
      source: "OFF",
      jsearch: { host: "openwebninja", keyState: "none" },
      serpapi: { keyState: "none" },
    });
  });

  it("uses the environment until something is saved", () => {
    const config = resolveJobSearchConfig(nothingSaved, {
      DOSSIER_JOBS_SOURCE: "jsearch",
      DOSSIER_JSEARCH_KEY: "ak_env",
      DOSSIER_JSEARCH_HOST: "rapidapi",
      DOSSIER_SERPAPI_KEY: "serp-env",
    });
    expect(config).toMatchObject({
      source: "JSEARCH",
      saved: false,
      jsearch: { key: "ak_env", host: "rapidapi", keyState: "env" },
      serpapi: { key: "serp-env", keyState: "env" },
    });
    expect(resolveJobSearchConfig(nothingSaved, { DOSSIER_JOBS_SOURCE: "off" }).source).toBeNull();
  });

  it("prefers what's saved, Off included, and decrypts saved keys", () => {
    const saved = {
      jobSource: "SERPAPI" as const,
      jsearchKeyEnc: encryptSecret(JOB_SOURCE_KEY, "ak_saved"),
      jsearchHost: "openwebninja" as const,
      serpapiKeyEnc: encryptSecret(JOB_SOURCE_KEY, "serp-saved"),
    };
    const config = resolveJobSearchConfig(saved, { DOSSIER_JOBS_SOURCE: "jsearch", DOSSIER_JSEARCH_KEY: "ak_env", DOSSIER_JSEARCH_HOST: "rapidapi" });
    expect(config).toMatchObject({
      source: "SERPAPI",
      saved: true,
      jsearch: { key: "ak_saved", host: "openwebninja", keyState: "set" },
      serpapi: { key: "serp-saved", keyState: "set" },
    });
    // Off saved, as an upgrade leaves a source that was removed: the environment's source doesn't take its place.
    const off = resolveJobSearchConfig({ ...saved, jobSource: "OFF" }, { DOSSIER_JOBS_SOURCE: "jsearch", DOSSIER_JSEARCH_KEY: "ak_env" });
    expect(off).toMatchObject({ source: null, saved: true });
    expect(jobSearchView(off).source).toBe("OFF");
  });

  it("says when a saved key can't be read, rather than using another", () => {
    const config = resolveJobSearchConfig(
      { ...nothingSaved, jobSource: "JSEARCH", jsearchKeyEnc: encryptSecret(JOB_SOURCE_KEY, "ak", "b".repeat(32)) },
      { DOSSIER_JSEARCH_KEY: "ak_env" },
    );
    expect(config.jsearch).toEqual({ key: null, host: "openwebninja", keyState: "unreadable" });
    expect(() => credentialsFor(config, "JSEARCH")).toThrow("Your saved JSearch key can't be read. Enter it again in Settings → Job search.");
  });
});

describe("SerpApi's key", () => {
  it("is set when saved, from the environment when only there, and none otherwise", () => {
    const saved = resolveJobSearchConfig({ ...nothingSaved, serpapiKeyEnc: encryptSecret(JOB_SOURCE_KEY, "serp_saved") }, { DOSSIER_SERPAPI_KEY: "serp_env" });
    expect(saved.serpapi).toEqual({ key: "serp_saved", keyState: "set" });
    expect(resolveJobSearchConfig(nothingSaved, { DOSSIER_JOBS_SOURCE: "serpapi", DOSSIER_SERPAPI_KEY: "serp_env" })).toMatchObject({
      source: "SERPAPI",
      serpapi: { key: "serp_env", keyState: "env" },
    });
    expect(resolveJobSearchConfig(nothingSaved, noEnv).serpapi).toEqual({ key: null, keyState: "none" });
    expect(jobSearchView(saved).serpapi).toEqual({ keyState: "set" });
    expect(credentialsFor(saved, "SERPAPI")).toEqual({ key: "serp_saved" });
  });

  it("says what's missing, or that the saved key can't be read", () => {
    const none = resolveJobSearchConfig(nothingSaved, noEnv);
    expect(() => credentialsFor(none, "SERPAPI")).toThrow(expect.objectContaining({ name: "JobSearchError", problem: "no-key" }));
    expect(() => credentialsFor(none, "SERPAPI")).toThrow("Add your SerpApi key in Settings → Job search first.");
    const unreadable = resolveJobSearchConfig({ ...nothingSaved, serpapiKeyEnc: encryptSecret(JOB_SOURCE_KEY, "serp", "b".repeat(32)) }, { DOSSIER_SERPAPI_KEY: "serp_env" });
    expect(unreadable.serpapi).toEqual({ key: null, keyState: "unreadable" });
    expect(() => credentialsFor(unreadable, "SERPAPI")).toThrow("Your saved SerpApi key can't be read. Enter it again in Settings → Job search.");
  });
});

describe("credentialsFor", () => {
  const config = resolveJobSearchConfig(
    { ...nothingSaved, jobSource: "JSEARCH", jsearchKeyEnc: encryptSecret(JOB_SOURCE_KEY, "ak_saved"), jsearchHost: "rapidapi" },
    noEnv,
  );

  it("gives each source its own key", () => {
    expect(credentialsFor(config, "JSEARCH")).toEqual({ key: "ak_saved", host: "rapidapi" });
  });

  it("says what's missing", () => {
    expect(() => credentialsFor(config, "SERPAPI")).toThrow("Add your SerpApi key in Settings → Job search first.");
    expect(() => credentialsFor(resolveJobSearchConfig(nothingSaved, noEnv), "JSEARCH")).toThrow("Add your JSearch key in Settings → Job search first.");
  });
});

describe("requestContext", () => {
  it("leaves sources at their own address, unless the end-to-end tests point them at a fake", () => {
    expect(requestContext("JSEARCH", undefined)).toEqual({});
    expect(requestContext("SERPAPI", "http://127.0.0.1:3998/")).toEqual({ baseUrl: "http://127.0.0.1:3998/serpapi" });
  });
});
