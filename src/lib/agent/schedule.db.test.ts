import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRun } from "@/lib/settings";
import { saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { nextAgentRun, resetInterruptedDrafts, scheduledRunDue, startDueRun } from "./schedule";
import { runLimitProblem } from "./runs";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const zone = vi.hoisted(() => ({ value: "America/Chicago" }));
vi.mock("@/lib/time-zone", () => ({ lastKnownTimeZone: async () => zone.value }));
vi.mock("@/lib/jobs/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jobs/runner")>()),
  startJob: vi.fn(async () => "agent-job"),
}));

const prisma = () => db.client!;
const run = (at: string, manual = false): AgentRun => ({ at, manual, message: null });

beforeEach(async () => {
  zone.value = "America/Chicago";
  await resetDatabase(prisma());
});
afterAll(() => prisma().$disconnect());

describe("when the daily run is due (E16-4)", () => {
  it("reads the hour and the day in the user's time zone, not the server's", () => {
    // 12:30 UTC is 07:30 in Chicago: due at 7 there. 07:30 UTC is only 02:30 there, though UTC has reached 7.
    expect(scheduledRunDue(new Date("2026-10-20T12:30:00Z"), 7, "America/Chicago", [])).toBe(true);
    expect(scheduledRunDue(new Date("2026-10-20T11:30:00Z"), 7, "America/Chicago", [])).toBe(false);
    expect(scheduledRunDue(new Date("2026-10-20T07:30:00Z"), 7, "America/Chicago", [])).toBe(false);
    expect(scheduledRunDue(new Date("2026-10-20T07:30:00Z"), 7, "UTC", [])).toBe(true);
    // Phoenix is UTC-7, with no daylight saving.
    expect(scheduledRunDue(new Date("2026-10-20T14:00:00Z"), 7, "America/Phoenix", [])).toBe(true);
    expect(scheduledRunDue(new Date("2026-10-20T13:59:00Z"), 7, "America/Phoenix", [])).toBe(false);
  });

  it("runs once a day: any run that day in the user's zone, scheduled or not, counts", () => {
    // 03:30 UTC on the 20th is still 22:30 on the 19th in Chicago.
    expect(scheduledRunDue(new Date("2026-10-20T12:30:00Z"), 7, "America/Chicago", [run("2026-10-20T03:30:00Z", true)])).toBe(true);
    expect(scheduledRunDue(new Date("2026-10-20T12:30:00Z"), 7, "UTC", [run("2026-10-20T03:30:00Z", true)])).toBe(false);
    expect(scheduledRunDue(new Date("2026-10-20T12:30:00Z"), 7, "America/Chicago", [run("2026-10-20T12:10:00Z")])).toBe(false);
  });

  it("keeps the hour across daylight saving changes", () => {
    // Chicago leaves summer time on 1 November 2026: 07:00 is 12:00 UTC the day before, 13:00 UTC that day.
    const ranSaturday = [run("2026-10-31T12:00:00Z")];
    expect(nextAgentRun(new Date("2026-10-31T14:00:00Z"), 7, "America/Chicago", ranSaturday).toISOString()).toBe("2026-11-01T13:00:00.000Z");
    // New York leaves it on 1 November 2026.
    const ranOn31st = [run("2026-10-31T11:00:00Z")];
    expect(nextAgentRun(new Date("2026-10-31T15:00:00Z"), 7, "America/New_York", ranOn31st).toISOString()).toBe("2026-11-01T12:00:00.000Z");
    // And Chicago goes back to summer time on 14 March 2027.
    expect(nextAgentRun(new Date("2027-03-13T15:00:00Z"), 7, "America/Chicago", [run("2027-03-13T13:00:00Z")]).toISOString()).toBe("2027-03-14T12:00:00.000Z");
  });

  it("says the next run is today's while it's still to come, and soon when it's overdue", () => {
    expect(nextAgentRun(new Date("2026-10-20T10:00:00Z"), 7, "America/Chicago", []).toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(nextAgentRun(new Date("2026-10-20T12:07:00Z"), 7, "America/Chicago", []).toISOString()).toBe("2026-10-20T12:15:00.000Z");
  });
});

describe("the limits (E16-4)", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("lets Run now go an hour after the previous run of either kind", () => {
    expect(runLimitProblem([], now, { manual: true })).toBeNull();
    expect(runLimitProblem([run("2026-10-20T11:35:00Z")], now, { manual: true })).toBe("The agent ran less than an hour ago. Try again in 35 minutes.");
    expect(runLimitProblem([run("2026-10-20T10:59:00Z", true)], now, { manual: true })).toBeNull();
    // A scheduled run only minds the daily limit.
    expect(runLimitProblem([run("2026-10-20T11:35:00Z")], now, { manual: false })).toBeNull();
  });

  it("allows 3 runs in any 24 hours", () => {
    const three = [run("2026-10-20T11:00:00Z"), run("2026-10-20T08:00:00Z"), run("2026-10-19T13:00:00Z")];
    expect(runLimitProblem(three, now, { manual: false })).toBe("The agent has run 3 times in the past 24 hours, as many as it may. Try again in 1 hour.");
    expect(runLimitProblem(three, new Date("2026-10-20T13:00:01Z"), { manual: false })).toBeNull();
    expect(runLimitProblem(three.slice(0, 2), now, { manual: false })).toBeNull();
  });
});

describe("the schedule (E16-4)", () => {
  it("starts the day's run when it's due and the agent is on, once", async () => {
    const { startJob } = await import("@/lib/jobs/runner");
    const due = new Date("2026-10-20T13:00:00Z");
    expect(await startDueRun(due)).toBeNull();
    await saveSettings({ agentEnabled: true });
    expect(await startDueRun(due)).toBe("agent-job");
    expect(startJob).toHaveBeenCalledWith(expect.objectContaining({ type: "agent-scan" }), { manual: false }, { key: "agent" });

    // Not while one is queued or running, nor before the hour, nor after today's.
    vi.mocked(startJob).mockClear();
    await prisma().job.create({ data: { type: "agent-scan", key: "agent", status: "RUNNING", input: { manual: false } } });
    expect(await startDueRun(due)).toBeNull();
    await prisma().job.deleteMany();
    expect(await startDueRun(new Date("2026-10-20T11:00:00Z"))).toBeNull();
    await saveSettings({ agentRuns: [run("2026-10-20T12:00:00Z")] });
    expect(await startDueRun(due)).toBeNull();
    expect(startJob).not.toHaveBeenCalled();
  });

  it("sends drafts a restart interrupted back to the queue, saying so", async () => {
    await prisma().agentCandidate.create({ data: { source: "JSEARCH", externalId: "job-1", dedupeKey: "k1", status: "DRAFTING" } });
    await prisma().agentCandidate.create({ data: { source: "JSEARCH", externalId: "job-2", dedupeKey: "k2", status: "DRAFTED" } });
    expect(await resetInterruptedDrafts()).toBe(1);
    expect(await prisma().agentCandidate.findMany({ orderBy: { externalId: "asc" }, select: { status: true, error: true } })).toEqual([
      { status: "SCORED", error: "Drafting was interrupted. Try again." },
      { status: "DRAFTED", error: null },
    ]);
  });
});
