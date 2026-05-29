import { describe, it, expect } from "vitest";
import { categorizeUserTasks, localDateKey, localTimeKey } from "./digest.js";
import type * as schema from "../db/schema.js";

type TaskRow = typeof schema.tasks.$inferSelect;

const NOW = new Date("2026-05-29T08:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function task(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    title: "Task",
    description: null,
    assignee_id: null,
    parent_id: null,
    state: "eligible",
    created_at: NOW,
    created_by: "creator",
    archived_at: null,
    recurrence_rule: null,
    recurrence_mode: null,
    completion_window_days: null,
    next_due_at: null,
    planned_for: null,
    points: null,
    tags: null,
    exposed_to_ha: false,
    is_household: false,
    auto_complete_when_children_done: true,
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
    const result = categorizeUserTasks(
      [task({ title: "vacuum", next_due_at: day("2026-05-27"), completion_window_days: 0 })],
      NOW,
      tz,
    );
    expect(result.overdue.map((t) => t.title)).toEqual(["vacuum"]);
    expect(result.dueToday).toEqual([]);
    expect(result.newlyEligible).toEqual([]);
  });

  it("a strict due-today chore (window 0) is due today", () => {
    const result = categorizeUserTasks(
      [task({ title: "trash", next_due_at: day("2026-05-29"), completion_window_days: 0 })],
      NOW,
      tz,
    );
    expect(result.dueToday.map((t) => t.title)).toEqual(["trash"]);
  });

  it("a chore that becomes eligible today with a window is a soft mention", () => {
    const result = categorizeUserTasks(
      [task({ title: "bushes", next_due_at: day("2026-05-29"), completion_window_days: 14 })],
      NOW,
      tz,
    );
    expect(result.newlyEligible.map((t) => t.title)).toEqual(["bushes"]);
    expect(result.dueToday).toEqual([]);
  });

  it("a chore that became eligible earlier is not repeated", () => {
    const result = categorizeUserTasks(
      [task({ title: "filter", next_due_at: day("2026-05-27"), completion_window_days: 14 })],
      NOW,
      tz,
    );
    expect(result.newlyEligible).toEqual([]);
    expect(result.dueToday).toEqual([]);
    expect(result.overdue).toEqual([]);
  });

  it("a task planned for today is due today even if the planned moment passed", () => {
    const result = categorizeUserTasks(
      [
        task({
          title: "dentist",
          next_due_at: day("2026-05-20"),
          completion_window_days: 30,
          planned_for: new Date("2026-05-29T06:00:00Z"),
        }),
      ],
      NOW,
      tz,
    );
    expect(result.dueToday.map((t) => t.title)).toEqual(["dentist"]);
  });

  it("ignores not-yet and done tasks", () => {
    const result = categorizeUserTasks(
      [
        task({ title: "future", next_due_at: day("2026-06-10"), completion_window_days: 0 }),
        task({ title: "done", state: "done", next_due_at: null }),
      ],
      NOW,
      tz,
    );
    expect(result.overdue).toEqual([]);
    expect(result.dueToday).toEqual([]);
    expect(result.newlyEligible).toEqual([]);
  });
});
