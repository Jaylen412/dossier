import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { attributionHref, SOURCE_INFO } from "@/lib/job-search/sources";

import { SourceAttribution } from "./source-attribution";

// No source asks for a label now, so SerpApi stands in for one whose terms
// ask for a link to its site for the posting's country, and JSearch for one
// that asks for plain text.
const original = { SERPAPI: { ...SOURCE_INFO.SERPAPI }, JSEARCH: { ...SOURCE_INFO.JSEARCH } };
beforeEach(() => {
  Object.assign(SOURCE_INFO.SERPAPI, {
    attribution: "Jobs by Example",
    attributionLink: { home: "https://www.example.co.uk", local: /^www\.example\.(?:[a-z]{2,3}|com\.[a-z]{2})$/ },
  });
  Object.assign(SOURCE_INFO.JSEARCH, { attribution: "Source: Example" });
});
afterEach(() => {
  Object.assign(SOURCE_INFO.SERPAPI, original.SERPAPI);
  Object.assign(SOURCE_INFO.JSEARCH, original.JSEARCH);
});

describe("attributionHref", () => {
  it("links to the source's site for the posting's country, read from its link", () => {
    expect(attributionHref("SERPAPI", "https://www.example.de/land/ad/4721394012?se=abc")).toBe("https://www.example.de");
    expect(attributionHref("SERPAPI", "https://www.example.com.au/land/ad/1")).toBe("https://www.example.com.au");
  });

  it("falls back to the source's home for a link that isn't on one of its sites", () => {
    expect(attributionHref("SERPAPI", "https://jobs.example/1")).toBe("https://www.example.co.uk");
    expect(attributionHref("SERPAPI", "https://www.example.de.example/1")).toBe("https://www.example.co.uk");
    expect(attributionHref("SERPAPI", "http://www.example.de/land/ad/1")).toBe("https://www.example.co.uk");
    expect(attributionHref("SERPAPI", "")).toBe("https://www.example.co.uk");
  });

  it("has no link for a plain-text label", () => {
    expect(attributionHref("JSEARCH", "https://www.example.de/land/ad/1")).toBeNull();
  });
});

describe("SourceAttribution", () => {
  it("is a link of at least 116 × 23 px when the terms ask for one", () => {
    render(<SourceAttribution source="SERPAPI" url="https://www.example.fr/land/ad/1" />);
    const link = screen.getByRole("link", { name: "Jobs by Example (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://www.example.fr");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("min-w-[116px]", "min-h-[23px]");
  });

  it("only keeps the room as a placeholder, hidden from assistive technology", () => {
    const { container } = render(<SourceAttribution source="SERPAPI" url="https://www.example.fr/land/ad/1" placeholder />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("is plain text when the terms ask for text, and nothing without a label", () => {
    const { container, rerender } = render(<SourceAttribution source="JSEARCH" url="https://jobs.example/1" />);
    expect(screen.getByText("Source: Example").tagName).toBe("P");
    rerender(<SourceAttribution source="JSEARCH" url="" placeholder />);
    expect(container).toBeEmptyDOMElement();
    Object.assign(SOURCE_INFO.JSEARCH, { attribution: null });
    rerender(<SourceAttribution source="JSEARCH" url="https://jobs.example/1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
