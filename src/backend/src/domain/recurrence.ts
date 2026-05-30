import { RRule } from "rrule";
import { addMonths, addYears } from "date-fns";

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Converts a Date to a UTC date string "YYYY-MM-DD". */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC midnight of the given date (used as rrule anchor or for day arithmetic). */
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Add `days` days to a YYYY-MM-DD string, returning a new YYYY-MM-DD string. */
function addDaysToString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return toDateString(new Date(Date.UTC(y, m - 1, d + days)));
}

// Parse an rrule string, anchoring DTSTART at `fallback` when the rule itself
// carries no DTSTART. Rules that specify their own DTSTART are respected.
function parseRuleAnchoredAt(ruleStr: string, fallback: Date): RRule {
  const parsed = RRule.fromString(ruleStr);
  const dtstart = parsed.origOptions.dtstart ?? fallback;
  return new RRule({ ...parsed.origOptions, dtstart });
}

// Parse rrule string, defaulting dtstart to a fixed early anchor so that
// rule.after() can find occurrences at any point in time regardless of when
// the task was created.
function parseRuleWithEarlyDtstart(ruleStr: string): RRule {
  return parseRuleAnchoredAt(ruleStr, new Date(Date.UTC(2000, 0, 1)));
}

function computeAfterCompletionNext(rule: RRule, base: Date): string {
  const freq = rule.options.freq;
  const interval = rule.options.interval ?? 1;
  // Snap to UTC midnight before adding so the next due date is day-aligned
  // regardless of when the completion happened.
  const snap = utcMidnight(base);
  switch (freq) {
    case RRule.DAILY:
      return toDateString(new Date(snap.getTime() + interval * 86400000));
    case RRule.WEEKLY:
      return toDateString(new Date(snap.getTime() + interval * 7 * 86400000));
    case RRule.MONTHLY:
      return toDateString(addMonths(snap, interval));
    case RRule.YEARLY:
      return toDateString(addYears(snap, interval));
    default:
      return toDateString(new Date(snap.getTime() + interval * 86400000));
  }
}

/**
 * Inclusive lower bound of the eligibility window.
 * Returns the YYYY-MM-DD string `windowDays` days before `dueAt`.
 */
export function computeEligibleStart(dueAt: string, windowDays: number): string {
  if (windowDays === 0) return dueAt;
  return addDaysToString(dueAt, -windowDays);
}

// ── Domain types ──────────────────────────────────────────────────────────────

export type ComputedTaskState = "not_yet" | "eligible" | "overdue" | "done" | "archived";

type TaskForNextDue = {
  recurrence_rule: string | null;
  recurrence_mode: "fixed" | "after_completion" | null;
  due_at: string | null;
};

type TaskForState = {
  archived_at: Date | null;
  state: "not_yet" | "eligible" | "overdue" | "done";
  recurrence_rule: string | null;
  due_at: string | null;
  completion_window_days: number | null;
};

type TaskForWindow = {
  due_at: string | null;
};

// ── Pure domain functions ─────────────────────────────────────────────────────

/**
 * Returns the next due_at for a recurring task as a YYYY-MM-DD string.
 * Pass null for lastCompletedAt on creation (first scheduling).
 */
export function computeNextDueAt(
  task: TaskForNextDue,
  lastCompletedAt: Date | null,
  now: Date,
): string {
  if (!task.recurrence_rule) throw new Error("Task has no recurrence rule");

  const isCreation = lastCompletedAt === null;

  if (task.recurrence_mode === "after_completion") {
    // On creation the task is due today; the interval only starts counting
    // once the task has been completed at least once.
    if (isCreation) return toDateString(now);
    return computeAfterCompletionNext(
      parseRuleWithEarlyDtstart(task.recurrence_rule),
      lastCompletedAt,
    );
  }

  // fixed: find the occurrence relative to the base date.
  if (isCreation) {
    // Anchor the schedule at the creation day (UTC midnight) so the first
    // occurrence is today, unless a calendar constraint (weekday, day-of-month,
    // or an explicit DTSTART in the rule) pushes it to a later slot.
    const start = utcMidnight(now);
    const rule = parseRuleAnchoredAt(task.recurrence_rule, start);
    return toDateString(rule.after(start, true) ?? new Date(start.getTime() + 365 * 86400000));
  }

  const rule = parseRuleWithEarlyDtstart(task.recurrence_rule);
  return toDateString(
    rule.after(lastCompletedAt, false) ??
      new Date(utcMidnight(lastCompletedAt).getTime() + 365 * 86400000),
  );
}

/**
 * Derives the current task state from the task's due_at date string and today's
 * local date string (YYYY-MM-DD). ISO 8601 date strings compare correctly
 * lexicographically so no Date objects are needed.
 *
 * State rules (see ADR-0007, ADR-0009):
 *   not_yet:  today < due_at − completion_window_days
 *   eligible: due_at − window ≤ today ≤ due_at
 *   overdue:  today > due_at
 */
export function computeTaskState(task: TaskForState, today: string): ComputedTaskState {
  if (task.archived_at !== null) return "archived";

  // one-off task that was completed
  if (task.state === "done" && task.recurrence_rule === null) return "done";

  // no due date: Someday or recurring with no due yet — treat as eligible
  if (task.due_at === null) return "eligible";

  const windowDays = task.completion_window_days ?? 0;
  const eligibleStart = computeEligibleStart(task.due_at, windowDays);

  if (today < eligibleStart) return "not_yet";
  if (today > task.due_at) return "overdue";
  return "eligible";
}

/**
 * Returns true if completedAt is on-time: before UTC midnight of the day after
 * due_at. Completing anytime on the due day (UTC) is on-time. Tasks with no
 * due_at are always on-time.
 */
export function isOnTime(task: TaskForWindow, completedAt: Date): boolean {
  if (task.due_at === null) return true;
  // Overdue begins at UTC midnight of the day after due_at.
  const dueMidnightUTC = new Date(task.due_at + "T00:00:00Z");
  const overdueSince = new Date(dueMidnightUTC.getTime() + 86400000);
  return completedAt.getTime() < overdueSince.getTime();
}

/**
 * Returns a human-readable English description of the recurrence.
 * The frontend has its own localized version; this is used in tests and as a
 * fallback for non-localized contexts.
 */
export function describeRecurrence(ruleStr: string, mode: "fixed" | "after_completion"): string {
  const rule = parseRuleWithEarlyDtstart(ruleStr);

  if (mode === "after_completion") {
    const freq = rule.options.freq;
    const interval = rule.options.interval ?? 1;

    let unit: string;
    switch (freq) {
      case RRule.DAILY:
        unit = interval === 1 ? "day" : `${interval} days`;
        break;
      case RRule.WEEKLY:
        unit = interval === 1 ? "week" : `${interval} weeks`;
        break;
      case RRule.MONTHLY:
        unit = interval === 1 ? "month" : `${interval} months`;
        break;
      case RRule.YEARLY:
        unit = interval === 1 ? "year" : `${interval} years`;
        break;
      default:
        unit = `${interval} day${interval === 1 ? "" : "s"}`;
    }

    return `Every ${unit} after last completion`;
  }

  return rule.toText();
}

/**
 * Suggests a default completion window (lead days before due) based on the
 * recurrence cadence. Longer cadences get more lead time so the task surfaces
 * in the user's feed well before the deadline.
 */
export function suggestCompletionWindow(ruleStr: string): number {
  const rule = parseRuleWithEarlyDtstart(ruleStr);
  const freq = rule.options.freq;
  const interval = rule.options.interval ?? 1;

  switch (freq) {
    case RRule.DAILY:
      return 0;
    case RRule.WEEKLY:
      if (interval <= 1) return 1;
      if (interval <= 2) return 2;
      return 3;
    case RRule.MONTHLY:
      if (interval <= 1) return 7;
      if (interval <= 3) return 14;
      if (interval <= 5) return 21;
      return 30;
    case RRule.YEARLY:
      return 30;
    default:
      return 0;
  }
}
