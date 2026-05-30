# ADR-0009 — Date-only storage for task dates

**Status:** Accepted  
**Date:** 2026-05-30

## Context

Task dates (`due_at`, `completions.cycle_due_at`) were stored as UTC millisecond timestamps (SQLite `INTEGER`). This introduced several problems:

- **Silent timezone bugs.** "Due November 22nd" stored as a UTC midnight timestamp means a different calendar day for users in UTC− timezones, making day-boundary comparisons fragile without explicit timezone handling everywhere.
- **Misleading model.** Household tasks are date-shaped ("vacuum every 7 days", "rent on the 1st"), not datetime-shaped. Storing times implied a precision that does not exist and was never meaningful.
- **Complexity tax.** Every consumer — recurrence engine, state machine, notifications, frontend — had to apply UTC-day arithmetic, timezone conversions, or both. Errors compounded silently.

## Decision

Store task dates as ISO 8601 date strings (`TEXT`, `YYYY-MM-DD`). These fields are timezone-agnostic: "2025-11-22" means November 22nd in everyone's calendar, with no timezone interpretation.

### Fields migrated

| Column | Before | After |
|---|---|---|
| `tasks.due_at` | `INTEGER` (Unix ms, UTC) | `TEXT` (`YYYY-MM-DD`) |
| `completions.cycle_due_at` | `INTEGER` (Unix ms, UTC) | `TEXT` (`YYYY-MM-DD`) |

### Fields unchanged (they are moments, not dates)

`tasks.created_at`, `tasks.archived_at`, `completions.completed_at`, `streaks.last_completed_at` — these record when something happened and stay as UTC millisecond timestamps.

### "Today" semantics

- **Frontend:** `new Date()` formatted to `YYYY-MM-DD` in local browser time. This is the user's calendar date.
- **Backend route handlers:** UTC date of `getNow()` (`now.toISOString().slice(0, 10)`).
- **Scheduler (digest/reminder):** `localDateKey(now, householdTimeZone)` — the household-local calendar date. Unchanged.

The household timezone setting now governs **only** notification scheduling (when to fire digests and reminders). It is no longer used for task date interpretation.

### Comparison

ISO 8601 date strings compare correctly lexicographically:
`"2025-11-21" < "2025-11-22" < "2025-11-23"` — no `Date` objects needed for state logic.

## Consequences

### Simplifications

- `computeTaskState(task, today: string)` — pure string comparison, no Date objects, no timezone math.
- `computeEligibleStart(dueAt: string, windowDays: number): string` — integer subtraction via UTC arithmetic, no DST exposure.
- `computeNextDueAt(...)` returns a `string` — rrule output converted to UTC date string once at the boundary.
- `isOnTime(task, completedAt: Date)` — compares a moment to UTC midnight of `due_at + 1 day`.
- Scheduler task categorization: `task.due_at === today` string equality, not `localDateKey(task.due_at, tz) === today`.
- Frontend "is due today": `task.due_at === format(new Date(), 'yyyy-MM-dd')` — no timezone math.
- Frontend "overdue by N days": `differenceInCalendarDays(now, parseISO(task.due_at))`.

### Trade-offs accepted

- **Data migration is naive.** The migration extracts the UTC date part of each stored timestamp: `strftime('%Y-%m-%d', due_at / 1000, 'unixepoch')`. For tasks stored at UTC midnight this is correct. For a household with a UTC− timezone where tasks were stored "today at local midnight" (which is tomorrow in UTC), one calendar day may shift. Accepted risk for a pre-1.0 project with a small number of real tasks; spot-fix after migration.
- **No time-of-day on tasks.** If a future feature needs "due at 3pm", that would be a new field — not a reversion to datetime storage.

## Alternatives rejected

- **Keep datetimes with explicit timezone metadata** — more code everywhere, no actual benefit for household-scale date logic.
- **UTC datetimes with convention "always UTC midnight"** — every consumer must convert back to date, error-prone, invisible invariant.
