import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AboutSection } from "./about-section";

const facts = [
  { label: "Version", value: "0.1.0" },
  { label: "Database", value: "PostgreSQL · 9.0 MB" },
];

describe("About (E10-9)", () => {
  it("lists the install's facts", () => {
    render(<AboutSection facts={facts} />);
    expect(screen.getByRole("heading", { name: "About this install" })).toBeInTheDocument();
    expect(screen.getByText("Free and open source. No accounts, no subscriptions.")).toBeInTheDocument();
    expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual(["0.1.0", "PostgreSQL · 9.0 MB"]);
    expect(screen.getByText("PostgreSQL · 9.0 MB")).toHaveClass("font-mono");
  });

  it("offers no update check or usage ping", () => {
    render(<AboutSection facts={facts} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
    expect(screen.getByText(/sends nothing to the project/)).toBeInTheDocument();
  });
});
