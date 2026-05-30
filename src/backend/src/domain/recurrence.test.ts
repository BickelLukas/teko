import { describe, it, expect } from "vitest";
import {
  computeNextDueAt,
  computeTaskState,
  isOnTime,
  suggestCompletionWindow,
  describeRecurrence,
} from "./recurrence.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a UTC Date — used only for `now` / `lastCompletedAt` (moments in time). */
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
        due_at: "2024-02-01",
      };
      expect(computeNextDueAt(task, utc(2024, 2, 15), utc(2024, 2, 15))).toBe("2024-03-01");
    });

    it("rent: completed on due date → next month", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        due_at: "2024-02-01",
      };
      expect(computeNextDueAt(task, utc(2024, 2, 1), utc(2024, 2, 1))).toBe("2024-03-01");
    });

    it("creation (null lastCompletedAt): now before due → returns current month's 1st if upcoming", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, null, utc(2024, 2, 5))).toBe("2024-03-01");
    });

    it("creation: now IS the 1st → returns today (inclusive)", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, null, utc(2024, 3, 1))).toBe("2024-03-01");
    });

    it("weekly: finds next pattern occurrence (not +7 days)", () => {
      // WEEKLY_7 dtstart is Jan 3, 2000 (Monday). Occurrences are every Monday.
      // Jan 3, 2024 is a Wednesday; next Monday is Jan 8.
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "fixed" as const,
        due_at: "2024-01-08",
      };
      expect(computeNextDueAt(task, utc(2024, 1, 8), utc(2024, 1, 8))).toBe("2024-01-15");
    });

    // The frontend emits rules without an explicit DTSTART. On creation the
    // schedule anchors at "now", so an unconstrained cadence is due immediately.
    describe("creation with no explicit DTSTART → first due is the creation day (UTC date)", () => {
      it("daily created mid-day → due today", () => {
        const task = {
          recurrence_rule: "RRULE:FREQ=DAILY",
          recurrence_mode: "fixed" as const,
          due_at: null,
        };
        expect(computeNextDueAt(task, null, utc(2024, 5, 15, 14, 30))).toBe("2024-05-15");
      });

      it("every 3 days created → due today", () => {
        const task = {
          recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=3",
          recurrence_mode: "fixed" as const,
          due_at: null,
        };
        expect(computeNextDueAt(task, null, utc(2024, 5, 15, 9, 0))).toBe("2024-05-15");
      });

      it("yearly created → due today", () => {
        const task = {
          recurrence_rule: "RRULE:FREQ=YEARLY",
          recurrence_mode: "fixed" as const,
          due_at: null,
        };
        expect(computeNextDueAt(task, null, utc(2024, 5, 15, 9, 0))).toBe("2024-05-15");
      });

      it("weekly on Monday created on a Tuesday → next Monday (calendar constraint wins)", () => {
        // May 14 2024 is a Tuesday; the next Monday is May 20.
        const task = {
          recurrence_rule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
          recurrence_mode: "fixed" as const,
          due_at: null,
        };
        expect(computeNextDueAt(task, null, utc(2024, 5, 14, 14, 0))).toBe("2024-05-20");
      });

      it("weekly on Monday created on a Monday → due today", () => {
        // May 20 2024 is a Monday.
        const task = {
          recurrence_rule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
          recurrence_mode: "fixed" as const,
          due_at: null,
        };
        expect(computeNextDueAt(task, null, utc(2024, 5, 20, 14, 0))).toBe("2024-05-20");
      });
    });
  });

  describe("after_completion mode", () => {
    it("vacuum: 7 days after completion", () => {
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "after_completion" as const,
        due_at: "2024-01-01",
      };
      expect(computeNextDueAt(task, utc(2024, 1, 1), utc(2024, 1, 1))).toBe("2024-01-08");
    });

    it("bushes: 6 months after completion", () => {
      const task = {
        recurrence_rule: MONTHLY_6,
        recurrence_mode: "after_completion" as const,
        due_at: "2024-04-01",
      };
      expect(computeNextDueAt(task, utc(2024, 10, 15), utc(2024, 10, 15))).toBe("2025-04-15");
    });

    it("month-end: Jan 31 + 1 month = Feb 28 (non-leap 2025)", () => {
      const task = {
        recurrence_rule: "RRULE:FREQ=MONTHLY;INTERVAL=1",
        recurrence_mode: "after_completion" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, utc(2025, 1, 31), utc(2025, 1, 31))).toBe("2025-02-28");
    });

    it("month-end: Jan 31 + 1 month = Feb 29 (leap 2024)", () => {
      const task = {
        recurrence_rule: "RRULE:FREQ=MONTHLY;INTERVAL=1",
        recurrence_mode: "after_completion" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, utc(2024, 1, 31), utc(2024, 1, 31))).toBe("2024-02-29");
    });

    it("creation (null lastCompletedAt): first due = today (interval starts after first completion)", () => {
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "after_completion" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, null, utc(2024, 1, 1))).toBe("2024-01-01");
    });

    it("snaps to UTC date when completed mid-day", () => {
      // Completed Jan 1 at 14:30 UTC → next due is Jan 8 (not Jan 8 + fractional day).
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "after_completion" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, utc(2024, 1, 1, 14, 30), utc(2024, 1, 1, 14, 30))).toBe(
        "2024-01-08",
      );
    });

    it("yearly after completion", () => {
      const task = {
        recurrence_rule: YEARLY,
        recurrence_mode: "after_completion" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, utc(2024, 3, 15), utc(2024, 3, 15))).toBe("2025-03-15");
    });
  });

  describe("anchored creation (passing anchor as now, lastCompletedAt=null)", () => {
    it("fixed weekly-monday: anchor on Sunday → first due = next Monday", () => {
      // WEEKLY_7 fires on Mondays. Feb 11 2024 = Sunday, Feb 12 = Monday.
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "fixed" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, null, utc(2024, 2, 11))).toBe("2024-02-12");
    });

    it("fixed weekly-monday: anchor on Monday → first due = that Monday (inclusive)", () => {
      const task = {
        recurrence_rule: WEEKLY_7,
        recurrence_mode: "fixed" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, null, utc(2024, 2, 12))).toBe("2024-02-12");
    });

    it("fixed monthly-1st: anchor mid-month → first due = next 1st", () => {
      const task = {
        recurrence_rule: MONTHLY_1ST,
        recurrence_mode: "fixed" as const,
        due_at: null,
      };
      expect(computeNextDueAt(task, null, utc(2024, 3, 15))).toBe("2024-04-01");
    });
  });

  it("throws when no recurrence_rule", () => {
    const task = { recurrence_rule: null, recurrence_mode: "fixed" as const, due_at: null };
    expect(() => computeNextDueAt(task, null, new Date())).toThrow();
  });
});

// ── computeTaskState ──────────────────────────────────────────────────────────
//
// Semantics (ADR-0007, ADR-0009):
//   not_yet:  today < due_at − window
//   eligible: due_at − window ≤ today ≤ due_at
//   overdue:  today > due_at

describe("computeTaskState", () => {
  // trim-bushes scenario: due Oct 1, window = 30 days lead
  //   → eligible from Sep 1 through Oct 1
  //   → not_yet before Sep 1
  //   → overdue after Oct 1
  const bushTask = {
    archived_at: null,
    state: "not_yet" as const,
    recurrence_rule: MONTHLY_6,
    due_at: "2024-10-01",
    completion_window_days: 30,
  };

  it("before eligible window → not_yet", () => {
    // Aug 31 is before Sep 1 (the start of the 30-day lead window)
    expect(computeTaskState(bushTask, "2024-08-31")).toBe("not_yet");
  });

  it("first day of eligible window (Sep 1) → eligible", () => {
    expect(computeTaskState(bushTask, "2024-09-01")).toBe("eligible");
  });

  it("mid-window (Sep 15) → eligible", () => {
    expect(computeTaskState(bushTask, "2024-09-15")).toBe("eligible");
  });

  it("on due date (Oct 1) → eligible", () => {
    expect(computeTaskState(bushTask, "2024-10-01")).toBe("eligible");
  });

  it("day after due date (Oct 2) → overdue", () => {
    expect(computeTaskState(bushTask, "2024-10-02")).toBe("overdue");
  });

  it("archived → archived", () => {
    const task = { ...bushTask, archived_at: utc(2024, 9, 1) };
    expect(computeTaskState(task, "2024-09-15")).toBe("archived");
  });

  it("one-off done → done", () => {
    const task = {
      archived_at: null,
      state: "done" as const,
      recurrence_rule: null,
      due_at: null,
      completion_window_days: null,
    };
    expect(computeTaskState(task, "2024-01-01")).toBe("done");
  });

  it("no due date → eligible (Someday item)", () => {
    const task = {
      archived_at: null,
      state: "eligible" as const,
      recurrence_rule: null,
      due_at: null,
      completion_window_days: null,
    };
    expect(computeTaskState(task, "2024-01-01")).toBe("eligible");
  });

  it("one-off with future due_at → not_yet (zero window)", () => {
    const task = {
      archived_at: null,
      state: "not_yet" as const,
      recurrence_rule: null,
      due_at: "2099-06-15",
      completion_window_days: 0,
    };
    expect(computeTaskState(task, "2024-01-01")).toBe("not_yet");
  });

  it("one-off due today → eligible", () => {
    const task = {
      archived_at: null,
      state: "eligible" as const,
      recurrence_rule: null,
      due_at: "2024-01-01",
      completion_window_days: 0,
    };
    expect(computeTaskState(task, "2024-01-01")).toBe("eligible");
  });

  it("one-off past due date → overdue", () => {
    const task = {
      archived_at: null,
      state: "overdue" as const,
      recurrence_rule: null,
      due_at: "2024-01-01",
      completion_window_days: 0,
    };
    expect(computeTaskState(task, "2024-01-02")).toBe("overdue");
  });

  describe("zero-width window (due on the day only)", () => {
    const strictTask = {
      archived_at: null,
      state: "not_yet" as const,
      recurrence_rule: DAILY,
      due_at: "2024-05-15",
      completion_window_days: 0,
    };

    it("on due date → eligible", () => {
      expect(computeTaskState(strictTask, "2024-05-15")).toBe("eligible");
    });

    it("next day → overdue", () => {
      expect(computeTaskState(strictTask, "2024-05-16")).toBe("overdue");
    });
  });

  describe("date-string boundary behavior", () => {
    it("task due_at Nov 22 is 'eligible' when today = Nov 22", () => {
      const t = { archived_at: null, state: "eligible" as const, recurrence_rule: null, due_at: "2025-11-22", completion_window_days: 0 };
      expect(computeTaskState(t, "2025-11-22")).toBe("eligible");
    });

    it("task due_at Nov 22 is 'overdue' when today = Nov 23", () => {
      const t = { archived_at: null, state: "overdue" as const, recurrence_rule: null, due_at: "2025-11-22", completion_window_days: 0 };
      expect(computeTaskState(t, "2025-11-23")).toBe("overdue");
    });

    it("task due_at Nov 22 is 'not_yet' when today = Nov 21 (zero window)", () => {
      const t = { archived_at: null, state: "not_yet" as const, recurrence_rule: null, due_at: "2025-11-22", completion_window_days: 0 };
      expect(computeTaskState(t, "2025-11-21")).toBe("not_yet");
    });
  });
});

// ── isOnTime ──────────────────────────────────────────────────────────────────
//
// On-time = completed before UTC midnight of the day after due_at.

describe("isOnTime", () => {
  it("completed on due date → true", () => {
    const task = { due_at: "2024-10-01" };
    expect(isOnTime(task, utc(2024, 10, 1, 12, 0, 0))).toBe(true);
  });

  it("completed end of due day (UTC) → true", () => {
    const task = { due_at: "2024-10-01" };
    expect(isOnTime(task, utc(2024, 10, 1, 23, 59, 59))).toBe(true);
  });

  it("completed next day → false (overdue)", () => {
    const task = { due_at: "2024-10-01" };
    expect(isOnTime(task, utc(2024, 10, 2, 0, 0, 0))).toBe(false);
  });

  it("completed early (before due date) → true", () => {
    const task = { due_at: "2024-10-01" };
    expect(isOnTime(task, utc(2024, 9, 15))).toBe(true);
  });

  it("no due date → always on time", () => {
    const task = { due_at: null };
    expect(isOnTime(task, new Date())).toBe(true);
  });

  it("completed exactly at UTC midnight of due date → true", () => {
    const task = { due_at: "2024-10-01" };
    expect(isOnTime(task, utc(2024, 10, 1, 0, 0, 0))).toBe(true);
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
