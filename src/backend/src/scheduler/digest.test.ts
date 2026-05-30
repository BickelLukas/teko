import { describe, it, expect } from "vitest";
import { categorizeUserTasks, localDateKey, localTimeKey } from "./digest.js";
import type * as schema from "../db/schema.js";

type TaskRow = typeof schema.tasks.$inferSelect;

const NOW = new Date("2026-05-29T08:00:00Z");

function task(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    title: "Task",
    description: null,
    assignee_id: null,
    state: "eligible",
    created_at: NOW,
    created_by: "creator",
    archived_at: null,
    recurrence_rule: null,
    recurrence_mode: null,
    completion_window_days: null,
    due_at: null,
    points: null,
    exposed_to_ha: false,
    ...overrides,
  };
}

describe("localDateKey / localTimeKey", () => {
  it("renders the household-local date and time", () => {
    // 2026-05-29 08:00 UTC is 10:00 in Berlin (CEST, UTC+2).
    expect(localDateKey(NOW, "Europe/Berlin")).toBe("2026-05-29");
    expect(localTimeKey(NOW, "Europe/Berlin")).toBe("10:00");
  });

  it("rolls the date back in a western timezone", () => {
    // 2026-05-29 08:00 UTC is 01:00 the same day in Los Angeles (PDT, UTC-7).
    expect(localDateKey(NOW, "America/Los_Angeles")).toBe("2026-05-29");
    expect(localTimeKey(NOW, "America/Los_Angeles")).toBe("01:00");
  });
});

describe("categorizeUserTasks", () => {
  const tz = "UTC";

  it("buckets an overdue task", () => {
    // due May 27, window 0, today May 29 → overdue
    const result = categorizeUserTasks(
      [task({ title: "vacuum", due_at: "2026-05-27", completion_window_days: 0 })],
      NOW,
      tz,
    );
    expect(result.overdue.map((t) => t.title)).toEqual(["vacuum"]);
    expect(result.dueToday).toEqual([]);
    expect(result.newlyEligible).toEqual([]);
  });

  it("a strict due-today chore (window 0) is due today", () => {
    // due May 29, window 0, today May 29 → eligible → dueToday
    const result = categorizeUserTasks(
      [task({ title: "trash", due_at: "2026-05-29", completion_window_days: 0 })],
      NOW,
      tz,
    );
    expect(result.dueToday.map((t) => t.title)).toEqual(["trash"]);
  });

  it("a chore whose eligibility window opens today is a soft mention", () => {
    // due Jun 12, window 14 → eligible_start = May 29 = today → newlyEligible
    const result = categorizeUserTasks(
      [task({ title: "bushes", due_at: "2026-06-12", completion_window_days: 14 })],
      NOW,
      tz,
    );
    expect(result.newlyEligible.map((t) => t.title)).toEqual(["bushes"]);
    expect(result.dueToday).toEqual([]);
  });

  it("a chore that became eligible earlier is not re-mentioned", () => {
    // due Jun 10, window 14 → eligible_start = May 27 ≠ today → skipped (eligible but not surfaced)
    const result = categorizeUserTasks(
      [task({ title: "filter", due_at: "2026-06-10", completion_window_days: 14 })],
      NOW,
      tz,
    );
    expect(result.newlyEligible).toEqual([]);
    expect(result.dueToday).toEqual([]);
    expect(result.overdue).toEqual([]);
  });

  it("ignores not-yet and done tasks", () => {
    // not_yet: due Jun 30, window 0 → eligible_start = Jun 30 > May 29 → not_yet
    // done: no due date, state=done, recurrence_rule=null → done
    const result = categorizeUserTasks(
      [
        task({ title: "future", due_at: "2026-06-30", completion_window_days: 0 }),
        task({ title: "done", state: "done", due_at: null }),
      ],
      NOW,
      tz,
    );
    expect(result.overdue).toEqual([]);
    expect(result.dueToday).toEqual([]);
    expect(result.newlyEligible).toEqual([]);
  });

  it("timezone: task due today in Berlin is in dueToday for Berlin timezone", () => {
    // Berlin time = UTC+2 on May 29 → localDateKey = "2026-05-29" for both UTC and Berlin
    const result = categorizeUserTasks(
      [task({ title: "berlin task", due_at: "2026-05-29", completion_window_days: 0 })],
      NOW,
      "Europe/Berlin",
    );
    expect(result.dueToday.map((t) => t.title)).toEqual(["berlin task"]);
  });
});
