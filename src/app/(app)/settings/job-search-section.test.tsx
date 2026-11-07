import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobSearchSettingsView } from "@/lib/job-search/sources";

import { saveJobSearchDetails, saveJobSource, saveJobSourceKey, testJobSource } from "./actions";
import { JobSearchSection } from "./job-search-section";

vi.mock("./actions", () => ({
  saveJobSource: vi.fn(),
  saveJobSearchDetails: vi.fn(),
  saveJobSourceKey: vi.fn(),
  testJobSource: vi.fn(),
}));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

const off: JobSearchSettingsView = {
  source: "OFF",
  jsearch: { host: "openwebninja", keyState: "none" },
  serpapi: { keyState: "none" },
};
const withSource = (view: Partial<JobSearchSettingsView>): JobSearchSettingsView => ({ ...off, ...view });

beforeEach(() => {
  vi.mocked(saveJobSource).mockReset().mockImplementation(async ({ source }) => ({ ok: true, data: withSource({ source }) }));
  vi.mocked(saveJobSearchDetails).mockReset().mockImplementation(async ({ jsearchHost = "openwebninja" }) => ({
    ok: true,
    data: withSource({ source: "JSEARCH", jsearch: { host: jsearchHost, keyState: "none" } }),
  }));
  vi.mocked(saveJobSourceKey).mockReset().mockResolvedValue({ ok: true, data: withSource({ source: "JSEARCH", jsearch: { host: "openwebninja", keyState: "set" } }) });
  vi.mocked(testJobSource).mockReset().mockResolvedValue({ ok: true, data: { connected: true, seconds: 0.8 } });
});

describe("JobSearchSection", () => {
  it("offers every source and Off, as a radio group, Off by default", () => {
    render(<JobSearchSection initial={off} />);
    expect(screen.getByRole("heading", { name: "Job search" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "JSearch",
      "SerpApi",
      "Off",
    ]);
    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test connection" })).not.toBeInTheDocument();
  });

  it("saves a source at once and says what's sent to it", async () => {
    render(<JobSearchSection initial={off} />);
    await userEvent.click(screen.getByRole("radio", { name: "JSearch" }));
    expect(saveJobSource).toHaveBeenCalledWith({ source: "JSEARCH" });
    expect(screen.getByRole("note")).toHaveTextContent("Your searches (keywords, place and filters) go to JSearch. Nothing from your profile does.");
    expect(screen.getByRole("link", { name: "OpenWeb Ninja" })).toHaveAttribute("href", "https://www.openwebninja.com/api/jsearch");
  });

  it("saves a key when you leave the field, then forgets it in the browser", async () => {
    render(<JobSearchSection initial={withSource({ source: "JSEARCH" })} />);
    await userEvent.type(screen.getByLabelText("API key"), "ak_secret");
    await userEvent.tab();
    expect(saveJobSourceKey).toHaveBeenCalledWith({ source: "JSEARCH", change: { action: "set", value: "ak_secret" } });
    await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
    expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "Saved · type a new key to replace it");
    await userEvent.click(screen.getByRole("button", { name: "Remove saved key" }));
    expect(saveJobSourceKey).toHaveBeenLastCalledWith({ source: "JSEARCH", change: { action: "clear" } });
  });

  it("saves a key on Enter too", async () => {
    render(<JobSearchSection initial={withSource({ source: "JSEARCH" })} />);
    await userEvent.type(screen.getByLabelText("API key"), "ak_secret{Enter}");
    expect(saveJobSourceKey).toHaveBeenCalledTimes(1);
  });

  it("shows SerpApi's key field with its sign-up link when SerpApi is chosen", async () => {
    render(<JobSearchSection initial={off} />);
    await userEvent.click(screen.getByRole("radio", { name: "SerpApi" }));
    expect(saveJobSource).toHaveBeenCalledWith({ source: "SERPAPI" });
    expect(await screen.findByRole("note")).toHaveTextContent("Your searches (keywords, place and filters) go to SerpApi. Nothing from your profile does.");
    expect(screen.getByRole("link", { name: "SerpApi's sign-up page" })).toHaveAttribute("href", "https://serpapi.com/users/sign_up");
    expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "Stored encrypted on your server");
    expect(screen.getByRole("status")).toHaveTextContent("a test uses one search from your plan");
  });

  it("shows the SerpApi key from the environment by its name", () => {
    render(<JobSearchSection initial={withSource({ source: "SERPAPI", serpapi: { keyState: "env" } })} />);
    expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "Using DOSSIER_SERPAPI_KEY · type one to save it here");
  });

  it("saves the key with source SERPAPI", async () => {
    vi.mocked(saveJobSourceKey).mockResolvedValue({ ok: true, data: withSource({ source: "SERPAPI", serpapi: { keyState: "set" } }) });
    render(<JobSearchSection initial={withSource({ source: "SERPAPI" })} />);
    await userEvent.type(screen.getByLabelText("API key"), "serp_secret");
    await userEvent.tab();
    expect(saveJobSourceKey).toHaveBeenCalledWith({ source: "SERPAPI", change: { action: "set", value: "serp_secret" } });
    await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
    await userEvent.click(screen.getByRole("button", { name: "Remove saved key" }));
    expect(saveJobSourceKey).toHaveBeenLastCalledWith({ source: "SERPAPI", change: { action: "clear" } });
  });

  it("switches where the JSearch key is from", async () => {
    render(<JobSearchSection initial={withSource({ source: "JSEARCH" })} />);
    await userEvent.click(screen.getByRole("radio", { name: "RapidAPI" }));
    expect(saveJobSearchDetails).toHaveBeenCalledWith({ jsearchHost: "rapidapi" });
    expect(await screen.findByRole("link", { name: "JSearch on RapidAPI" })).toBeInTheDocument();
  });

  it("shows keys from the environment and keys that can't be read", () => {
    const { unmount } = render(<JobSearchSection initial={withSource({ source: "JSEARCH", jsearch: { host: "openwebninja", keyState: "env" } })} />);
    expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "Using DOSSIER_JSEARCH_KEY · type one to save it here");
    unmount();
    render(<JobSearchSection initial={withSource({ source: "JSEARCH", jsearch: { host: "openwebninja", keyState: "unreadable" } })} />);
    expect(screen.getByText("Your saved key can't be read. Please enter it again.")).toBeInTheDocument();
  });

  it("tests the connection and says how it went", async () => {
    render(<JobSearchSection initial={withSource({ source: "JSEARCH", jsearch: { host: "openwebninja", keyState: "set" } })} />);
    expect(screen.getByRole("status")).toHaveTextContent("a test uses one search from your plan");
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Connected · JSearch answered in 0.8 s")).toBeInTheDocument();

    vi.mocked(testJobSource).mockResolvedValue({ ok: true, data: { connected: false, message: "JSearch didn't accept your key." } });
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("JSearch didn't accept your key.")).toBeInTheDocument();

    vi.mocked(testJobSource).mockResolvedValue({ ok: false, error: "Something went wrong on the server. Please try again." });
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Something went wrong on the server. Please try again.")).toBeInTheDocument();
  });
});
