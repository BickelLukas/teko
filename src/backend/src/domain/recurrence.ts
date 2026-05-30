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
  // Due dates are day-granular: drop the completion's time of day so the next
  // due lands at the start of the day, regardless of when it was completed.
  switch (freq) {
    case RRule.DAILY:
      return startOfDayUTC(addDaysUTC(base, interval));
    case RRule.WEEKLY:
      return startOfDayUTC(addDaysUTC(base, interval * 7));
    case RRule.MONTHLY:
      return startOfDayUTC(addMonths(base, interval));
    case RRule.YEARLY:
      return startOfDayUTC(addYears(base, interval));
    default:
      return startOfDayUTC(addDaysUTC(base, interval));
  }
}

/**
 * Inclusive lower bound of the eligibility window.
 * The task becomes visible/eligible this many days before due_at.
 */
export function computeEligibleStart(dueAt: Date, windowDays: number): Date {
  return addDaysUTC(startOfDayUTC(dueAt), -windowDays);
}

// ── Domain types ──────────────────────────────────────────────────────────────

export type ComputedTaskState = "not_yet" | "eligible" | "overdue" | "done" | "archived";

type TaskForNextDue = {
  recurrence_rule: string | null;
  recurrence_mode: "fixed" | "after_completion" | null;
  due_at: Date | null;
};

type TaskForState = {
  archived_at: Date | null;
  state: "not_yet" | "eligible" | "overdue" | "done";
  recurrence_rule: string | null;
  due_at: Date | null;
  completion_window_days: number | null;
};

type TaskForWindow = {
  due_at: Date | null;
};

// ── Pure domain functions ─────────────────────────────────────────────────────

/**
 * Returns the next due_at for a recurring task.
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
    // On creation the task is due today; the interval only starts counting
    // once the task has been completed at least once.
    if (isCreation) return startOfDayUTC(now);
    return computeAfterCompletionNext(
      parseRuleWithEarlyDtstart(task.recurrence_rule),
      lastCompletedAt,
    );
  }

  // fixed: find the occurrence relative to the base date.
  if (isCreation) {
    // Anchor the schedule at the creation day (start of day UTC) so the first
    // occurrence is today, unless a calendar constraint (weekday, day-of-month,
    // or an explicit DTSTART in the rule) pushes it to a later slot.
    const start = startOfDayUTC(now);
    const rule = parseRuleAnchoredAt(task.recurrence_rule, start);
    return rule.after(start, true) ?? addDaysUTC(start, 365);
  }

  const rule = parseRuleWithEarlyDtstart(task.recurrence_rule);
  return rule.after(lastCompletedAt, false) ?? addDaysUTC(lastCompletedAt, 365);
}

/**
 * Derives the current task state from timestamps.
 * The returned value may be "archived" even though the DB schema stores
 * archived state via the archived_at column rather than the state column.
 *
 * State rules (see ADR-0007):
 *   not_yet:  now < due_at − completion_window_days
 *   eligible: due_at − completion_window_days ≤ now < start-of-day(due_at) + 1 day
 *   overdue:  now ≥ start-of-day(due_at) + 1 day
 *
 * Due dates are day-granular (stored at midnight UTC). A task remains eligible
 * for the entire due day; it only becomes overdue the day after due_at.
 */
export function computeTaskState(task: TaskForState, now: Date): ComputedTaskState {
  if (task.archived_at !== null) return "archived";

  // one-off task that was completed
  if (task.state === "done" && task.recurrence_rule === null) return "done";

  const nowMs = now.getTime();

  // no due date: Someday or recurring with no due yet — treat as eligible
  if (task.due_at === null) return "eligible";

  const windowDays = task.completion_window_days ?? 0;
  const eligibleStartMs = computeEligibleStart(task.due_at, windowDays).getTime();
  // Overdue begins the day after due_at (task is eligible for the whole due day)
  const overdueSinceMs = addDaysUTC(startOfDayUTC(task.due_at), 1).getTime();

  if (nowMs < eligibleStartMs) return "not_yet";
  if (nowMs >= overdueSinceMs) return "overdue";
  return "eligible";
}

/**
 * Returns true if completedAt is on-time: before the start of the day after due_at.
 * This mirrors the day-granular due model — completing anytime on the due day is on-time.
 * Early completion (before the eligibility window opens) is also on-time.
 * Tasks with no due_at are always on-time.
 */
export function isOnTime(task: TaskForWindow, completedAt: Date): boolean {
  if (task.due_at === null) return true;
  const overdueSince = addDaysUTC(startOfDayUTC(task.due_at), 1);
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
