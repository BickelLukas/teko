# ADR-0007 — Single `due_at` temporal model

**Status:** Accepted  
**Date:** 2026-05-30

## Context

The original task model stored two date fields:
- `next_due_at` — the cadence anchor for recurring tasks, driven by the RRULE.
- `planned_for` — a one-off due date for non-recurring tasks, or an optional "I'll do this Thursday" commitment within a recurring task's completion window.

This created overlapping UI actions (Snooze / Schedule / Reschedule) and a redundant `planned` state that modeled a product affordance with limited value: telling the household "I'll do this specific day." In practice, users just want to be able to move the due date in either direction — earlier or later — without complexity.

Investigation confirmed the recurrence engine does **not** anchor on `next_due_at` when computing the next occurrence after completion; it anchors on completion time. This means the stored due date is an *output* of recurrence math, not an *input*, so collapsing the two fields is safe.

## Decision

Replace both `next_due_at` and `planned_for` with a single `due_at` column. Drop the `planned` state.

## The new model

### Fields

| Field | Meaning |
|-------|---------|
| `due_at` | The task's deadline. Set by the user (one-off) or computed from the recurrence rule after completion. `null` for Someday items. |
| `completion_window_days` | Days **before** `due_at` the task becomes visible/eligible. Flipped meaning from v0: was "grace days after due", now is "lead days before due." |

### State machine

Stored in the DB as `not_yet | eligible | overdue | done`. Computed `archived` remains derived from `archived_at`.

| State | Condition |
|-------|-----------|
| `not_yet` | `now < due_at − completion_window_days` |
| `eligible` | `due_at − completion_window_days ≤ now ≤ due_at` |
| `overdue` | `now > due_at` |
| `done` | one-off task completed (terminal) |
| `archived` | `archived_at IS NOT NULL` (computed) |

### On-time / streaks

Completing by `due_at` is on-time. `completion_window_days` affects *visibility*, not on-time judgment. Rescheduling before completing is allowed and does not break a streak — the user commits to a new deadline, and meeting it counts. This is an honor-system trade-off for a household tool.

### Single Reschedule action

All tasks have one date action: **Reschedule**. It sets `due_at` to any chosen date, or to `null` (which moves the task to Someday). This replaces the old Snooze (push forward only), Schedule (set `planned_for`), and Unschedule (clear `planned_for`) actions.

### Notifications

The daily digest surfaces:
- `overdue` tasks: prominent treatment.
- Tasks whose eligibility window opens today ("newly eligible"): soft mention.
- Tasks due today (`due_at` = today): prominent.

## Consequences

- **Schema migration required.** Data migration: `due_at = COALESCE(next_due_at, planned_for)` preserves all scheduled dates; `state = 'eligible' WHERE state = 'planned'`. `completion_window_days` values are reinterpreted in-place (acceptable pre-1.0, noted in the migration).
- **Future HA integration** must consume `due_at` (not `next_due_at`), must not expect `planned_for`, and must not handle the `planned` state. The integration does not exist yet; design it against these names from the start.
- **Simpler UI.** One date action per task regardless of type. Fewer states to display.
- **Window semantics inverted.** A monthly task with `completion_window_days = 14` now becomes eligible 14 days *before* the deadline rather than staying on-time 14 days *after* it. Existing values are reused as-is post-migration; pre-1.0 this is accepted.

## Superseded guidance

References to `planned_for`, `next_due_at`, `state = 'planned'`, snooze, schedule, or unschedule in earlier ADRs are superseded by this decision.
