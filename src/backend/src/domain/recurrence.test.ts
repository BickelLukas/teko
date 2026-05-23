import { describe, it, expect } from "vitest";
import {
  computeNextDueAt,
  computeTaskState,
  isWithinCompletionWindow,
  suggestCompletionWindow,
  describeRecurrence,
} from "./recurrence.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function utc(year: number, month: number, day: number, h = 0, m = 0, s = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, h, m, s));
}

const MONTHLY_1ST = "DTSTART:20000101T000000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1";
const WEEKLY_7 = "DTSTART:20000103T000000Z\nRRULE:FREQ=WEEKLY;INTERVAL=1";
const MONTHLY_6 = "RRULE:FREQ=MONTHLY;INTERVAL=6";
const DAILY = "RRULE:FREQ=DAILY";
const YEARLY = "RRULE:FREQ=YEARLY";

// ── computeNextDueAt ──────────────────────────────────────────────────────────

describe("computeNextDueAt", () => {
  describe("fixed mode", () => {
    it("rent: completed mid-month → next 1st", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        next_due_at: utc(2024, 2, 1),
      };
      const result = computeNextDueAt(task, utc(2024, 2, 15), utc(2024, 2, 15));
      expect(result).toEqual(utc(2024, 3, 1));
    });

    it("rent: completed on due date → next month", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        next_due_at: utc(2024, 2, 1),
      };
      const result = computeNextDueAt(task, utc(2024, 2, 1), utc(2024, 2, 1));
      expect(result).toEqual(utc(2024, 3, 1));
    });

    it("creation (null lastCompletedAt): now before due → returns current month's 1st if upcoming", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        next_due_at: null,
      };
      const result = computeNextDueAt(task, null, utc(2024, 2, 5));
      expect(result).toEqual(utc(2024, 3, 1));
    });

    it("creation: now IS the 1st → returns today (inclusive)", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        next_due_at: null,
      };
      const result = computeNextDueAt(task, null, utc(2024, 3, 1));
      expect(result).toEqual(utc(2024, 3, 1));
    });

    it("weekly: finds next pattern occurrence (not +7 days)", () => {
      // WEEKLY_7 dtstart is Jan 3, 2000 (Monday). Occurrences are every Monday.
      // Jan 3, 2024 is a Wednesday; next Monday is Jan 8.
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "fixed" as const,
        next_due_at: utc(2024, 1, 8),
      };
      const result = computeNextDueAt(task, utc(2024, 1, 8), utc(2024, 1, 8));
      expect(result).toEqual(utc(2024, 1, 15));
    });
  });

  describe("after_completion mode", () => {
    it("vacuum: 7 days after completion", () => {
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "after_completion" as const,
        next_due_at: utc(2024, 1, 1),
      };
      const result = computeNextDueAt(task, utc(2024, 1, 1), utc(2024, 1, 1));
      expect(result).toEqual(utc(2024, 1, 8));
    });

    it("bushes: 6 months after completion", () => {
      const task = {
        recurrence_rule: MONTHLY_6,
        recurrence_mode: "after_completion" as const,
        next_due_at: utc(2024, 4, 1),
      };
      const result = computeNextDueAt(task, utc(2024, 10, 15), utc(2024, 10, 15));
      expect(result).toEqual(utc(2025, 4, 15));
    });

    it("month-end: Jan 31 + 1 month = Feb 28 (non-leap 2025)", () => {
      const task = {
        recurrence_rule: "RRULE:FREQ=MONTHLY;INTERVAL=1",
        recurrence_mode: "after_completion" as const,
        next_due_at: null,
      };
      const result = computeNextDueAt(task, utc(2025, 1, 31), utc(2025, 1, 31));
      expect(result).toEqual(utc(2025, 2, 28));
    });

    it("month-end: Jan 31 + 1 month = Feb 29 (leap 2024)", () => {
      const task = {
        recurrence_rule: "RRULE:FREQ=MONTHLY;INTERVAL=1",
        recurrence_mode: "after_completion" as const,
        next_due_at: null,
      };
      const result = computeNextDueAt(task, utc(2024, 1, 31), utc(2024, 1, 31));
      expect(result).toEqual(utc(2024, 2, 29));
    });

    it("creation (null lastCompletedAt): first due = now + interval", () => {
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "after_completion" as const,
        next_due_at: null,
      };
      const result = computeNextDueAt(task, null, utc(2024, 1, 1));
      expect(result).toEqual(utc(2024, 1, 8));
    });

    it("yearly after completion", () => {
      const task = {
        recurrence_rule: YEARLY,
        recurrence_mode: "after_completion" as const,
        next_due_at: null,
      };
      const result = computeNextDueAt(task, utc(2024, 3, 15), utc(2024, 3, 15));
      expect(result).toEqual(utc(2025, 3, 15));
    });
  });

  it("throws when no recurrence_rule", () => {
    const task = { recurrence_rule: null, recurrence_mode: "fixed" as const, next_due_at: null };
    expect(() => computeNextDueAt(task, null, new Date())).toThrow();
  });
});

// ── computeTaskState ──────────────────────────────────────────────────────────

describe("computeTaskState", () => {
  // trim-bushes scenario: due Oct 1, window = 30 days
  const bushTask = {
    archived_at: null,
    state: "not_yet" as const,
    recurrence_rule: MONTHLY_6,
    next_due_at: utc(2024, 10, 1),
    completion_window_days: 30,
    planned_for: null,
  };

  it("before due → not_yet", () => {
    expect(computeTaskState(bushTask, utc(2024, 9, 30, 23, 59, 59))).toBe("not_yet");
  });

  it("on due date → eligible", () => {
    expect(computeTaskState(bushTask, utc(2024, 10, 1, 0, 0, 0))).toBe("eligible");
  });

  it("mid-window → eligible", () => {
    expect(computeTaskState(bushTask, utc(2024, 10, 15))).toBe("eligible");
  });

  it("last day of window (Oct 31) → eligible", () => {
    expect(computeTaskState(bushTask, utc(2024, 10, 31, 23, 59, 59))).toBe("eligible");
  });

  it("day after window end (Nov 1) → overdue", () => {
    expect(computeTaskState(bushTask, utc(2024, 11, 1, 0, 0, 0))).toBe("overdue");
  });

  it("planned future date → planned", () => {
    const task = { ...bushTask, planned_for: utc(2024, 10, 20) };
    expect(computeTaskState(task, utc(2024, 10, 10))).toBe("planned");
  });

  it("planned date in past → eligible (not planned)", () => {
    const task = { ...bushTask, planned_for: utc(2024, 10, 20) };
    expect(computeTaskState(task, utc(2024, 10, 21))).toBe("eligible");
  });

  it("archived → archived", () => {
    const task = { ...bushTask, archived_at: utc(2024, 9, 1) };
    expect(computeTaskState(task, utc(2024, 10, 15))).toBe("archived");
  });

  it("one-off done → done", () => {
    const task = {
      archived_at: null,
      state: "done" as const,
      recurrence_rule: null,
      next_due_at: null,
      completion_window_days: null,
      planned_for: null,
    };
    expect(computeTaskState(task, new Date())).toBe("done");
  });

  it("no due date → eligible (unscheduled one-off)", () => {
    const task = {
      archived_at: null,
      state: "eligible" as const,
      recurrence_rule: null,
      next_due_at: null,
      completion_window_days: null,
      planned_for: null,
    };
    expect(computeTaskState(task, new Date())).toBe("eligible");
  });

  describe("zero-width window", () => {
    const strictTask = {
      archived_at: null,
      state: "not_yet" as const,
      recurrence_rule: DAILY,
      next_due_at: utc(2024, 5, 15),
      completion_window_days: 0,
      planned_for: null,
    };

    it("on due date → eligible", () => {
      expect(computeTaskState(strictTask, utc(2024, 5, 15, 12, 0, 0))).toBe("eligible");
    });

    it("next day → overdue", () => {
      expect(computeTaskState(strictTask, utc(2024, 5, 16, 0, 0, 0))).toBe("overdue");
    });
  });
});

// ── isWithinCompletionWindow ──────────────────────────────────────────────────

describe("isWithinCompletionWindow", () => {
  const dueOct1 = utc(2024, 10, 1);

  it("window=0: completed on due date → true", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 0 };
    expect(isWithinCompletionWindow(task, utc(2024, 10, 1, 12, 0, 0))).toBe(true);
  });

  it("window=0: completed end of due day → true", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 0 };
    expect(isWithinCompletionWindow(task, utc(2024, 10, 1, 23, 59, 59))).toBe(true);
  });

  it("window=0: completed next day → false", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 0 };
    expect(isWithinCompletionWindow(task, utc(2024, 10, 2, 0, 0, 0))).toBe(false);
  });

  it("window=30: completed on due date → true", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 30 };
    expect(isWithinCompletionWindow(task, utc(2024, 10, 1))).toBe(true);
  });

  it("window=30: completed day 30 → true (last day)", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 30 };
    expect(isWithinCompletionWindow(task, utc(2024, 10, 31, 23, 59, 59))).toBe(true);
  });

  it("window=30: completed Nov 1 → false (past window)", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 30 };
    expect(isWithinCompletionWindow(task, utc(2024, 11, 1, 0, 0, 0))).toBe(false);
  });

  it("no due date → always on time", () => {
    const task = { next_due_at: null, completion_window_days: null };
    expect(isWithinCompletionWindow(task, new Date())).toBe(true);
  });

  it("completed before due date → true (early completion is on time)", () => {
    const task = { next_due_at: dueOct1, completion_window_days: 30 };
    expect(isWithinCompletionWindow(task, utc(2024, 9, 30))).toBe(true);
  });

  it("snoozed task completed early → true", () => {
    const task = { next_due_at: utc(2024, 12, 1), completion_window_days: 0 };
    expect(isWithinCompletionWindow(task, utc(2024, 10, 15))).toBe(true);
  });
});

// ── suggestCompletionWindow ───────────────────────────────────────────────────

describe("suggestCompletionWindow", () => {
  it("daily → 0", () => expect(suggestCompletionWindow(DAILY)).toBe(0));
  it("weekly → 1", () => expect(suggestCompletionWindow("RRULE:FREQ=WEEKLY")).toBe(1));
  it("every 2 weeks → 2", () =>
    expect(suggestCompletionWindow("RRULE:FREQ=WEEKLY;INTERVAL=2")).toBe(2));
  it("monthly → 7", () => expect(suggestCompletionWindow("RRULE:FREQ=MONTHLY")).toBe(7));
  it("every 3 months → 14", () =>
    expect(suggestCompletionWindow("RRULE:FREQ=MONTHLY;INTERVAL=3")).toBe(14));
  it("every 6 months → 30", () =>
    expect(suggestCompletionWindow("RRULE:FREQ=MONTHLY;INTERVAL=6")).toBe(30));
  it("yearly → 30", () => expect(suggestCompletionWindow(YEARLY)).toBe(30));
});

// ── describeRecurrence ────────────────────────────────────────────────────────

describe("describeRecurrence", () => {
  it("fixed weekly → rrule text", () => {
    const desc = describeRecurrence("RRULE:FREQ=WEEKLY", "fixed");
    expect(desc.toLowerCase()).toContain("week");
  });

  it("after_completion 7 days", () => {
    const desc = describeRecurrence(WEEKLY_7, "after_completion");
    expect(desc).toContain("after last completion");
    expect(desc.toLowerCase()).toMatch(/week|7 day/);
  });

  it("after_completion 6 months", () => {
    const desc = describeRecurrence(MONTHLY_6, "after_completion");
    expect(desc).toContain("after last completion");
    expect(desc).toContain("6");
  });

  it("fixed daily", () => {
    const desc = describeRecurrence(DAILY, "fixed");
    expect(desc.toLowerCase()).toContain("day");
  });
});
