import { RRule } from "rrule";
import { addMonths, addYears } from "date-fns";

// ── Internal helpers ──────────────────────────────────────────────────────────

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

function computeAfterCompletionNext(rule: RRule, base: Date): Date {
  const freq = rule.options.freq;
  const interval = rule.options.interval ?? 1;
  switch (freq) {
    case RRule.DAILY:
      return addDaysUTC(base, interval);
    case RRule.WEEKLY:
      return addDaysUTC(base, interval * 7);
    case RRule.MONTHLY:
      return addMonths(base, interval);
    case RRule.YEARLY:
      return addYears(base, interval);
    default:
      return addDaysUTC(base, interval);
  }
}

/**
 * Exclusive upper bound of the completion window.
 * A completion timestamped before this value is on time; at or after is overdue.
 */
export function computeWindowEnd(nextDueAt: Date, windowDays: number): Date {
  return addDaysUTC(startOfDayUTC(nextDueAt), windowDays + 1);
}

// ── Domain types ──────────────────────────────────────────────────────────────

export type ComputedTaskState =
  | "not_yet"
  | "eligible"
  | "planned"
  | "overdue"
  | "done"
  | "archived";

type TaskForNextDue = {
  recurrence_rule: string | null;
  recurrence_mode: "fixed" | "after_completion" | null;
  next_due_at: Date | null;
};

type TaskForState = {
  archived_at: Date | null;
  state: "not_yet" | "eligible" | "planned" | "overdue" | "done";
  recurrence_rule: string | null;
  next_due_at: Date | null;
  completion_window_days: number | null;
  planned_for: Date | null;
};

type TaskForWindow = {
  next_due_at: Date | null;
  completion_window_days: number | null;
};

// ── Pure domain functions ─────────────────────────────────────────────────────

/**
 * Returns the next next_due_at for a recurring task.
 * Pass null for lastCompletedAt on creation (first scheduling).
 */
export function computeNextDueAt(
  task: TaskForNextDue,
  lastCompletedAt: Date | null,
  now: Date,
): Date {
  if (!task.recurrence_rule) throw new Error("Task has no recurrence rule");

  const isCreation = lastCompletedAt === null;

  if (task.recurrence_mode === "after_completion") {
    // On creation the task is due now; the interval only starts counting once
    // the task has been completed at least once.
    if (isCreation) return now;
    return computeAfterCompletionNext(
      parseRuleWithEarlyDtstart(task.recurrence_rule),
      lastCompletedAt,
    );
  }

  // fixed: find the occurrence relative to the base date.
  if (isCreation) {
    // Anchor the schedule at creation time so the first occurrence is "now",
    // unless a calendar constraint (weekday, day-of-month, or an explicit
    // DTSTART in the rule) pushes it to a later slot.
    const rule = parseRuleAnchoredAt(task.recurrence_rule, now);
    return rule.after(now, true) ?? addDaysUTC(now, 365);
  }

  const rule = parseRuleWithEarlyDtstart(task.recurrence_rule);
  return rule.after(lastCompletedAt, false) ?? addDaysUTC(lastCompletedAt, 365);
}

/**
 * Derives the current task state from timestamps.
 * The returned value may be "archived" even though the DB schema stores
 * archived state via the archived_at column rather than the state column.
 */
export function computeTaskState(task: TaskForState, now: Date): ComputedTaskState {
  if (task.archived_at !== null) return "archived";

  // one-off task that was completed
  if (task.state === "done" && task.recurrence_rule === null) return "done";

  const nowMs = now.getTime();

  // no due date: one-off task, may still have a planned_for date
  if (task.next_due_at === null) {
    if (task.planned_for !== null && task.planned_for.getTime() >= nowMs) return "planned";
    return "eligible";
  }

  const nextDueMs = task.next_due_at.getTime();

  if (nowMs < nextDueMs) return "not_yet";

  const windowDays = task.completion_window_days ?? 0;
  const windowEndMs = computeWindowEnd(task.next_due_at, windowDays).getTime();

  if (nowMs >= windowEndMs) return "overdue";

  // within window — check if a future planned date is set
  if (task.planned_for !== null && task.planned_for.getTime() >= nowMs) return "planned";

  return "eligible";
}

/**
 * Returns true if completedAt is within the task's completion window.
 * Early completion (before next_due_at) is treated as on-time: paying rent
 * a day early or finishing a snoozed chore ahead of plan should not reset
 * the streak.
 */
export function isWithinCompletionWindow(task: TaskForWindow, completedAt: Date): boolean {
  if (task.next_due_at === null) return true;

  const completedMs = completedAt.getTime();
  const windowDays = task.completion_window_days ?? 0;

  return completedMs < computeWindowEnd(task.next_due_at, windowDays).getTime();
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
 * Suggests a default completion window (in days) based on the recurrence cadence.
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
