---
name: project-phase2-complete
description: Phase 2 (recurrence engine) complete — domain module, scheduler, new API endpoints, frontend RecurrencePicker and task list state
metadata:
  type: project
---

Phase 2 is complete as of 2026-05-23.

**Why:** Implements the core recurrence engine — the heart of the product.

**What was built:**
- `src/backend/src/domain/recurrence.ts` — 5 pure functions: `computeNextDueAt`, `computeTaskState`, `isWithinCompletionWindow`, `describeRecurrence`, `suggestCompletionWindow`
- `src/backend/src/domain/recurrence.test.ts` — 52 domain tests (TDD, written first)
- `src/backend/src/scheduler/tick.ts` — `runTick()` recomputes state for all active recurring tasks
- `src/backend/src/scheduler/index.ts` — node-cron every-minute tick
- `src/backend/src/routes/dev.ts` — `POST /api/_dev/tick` for manual tick in dev mode
- `src/backend/src/routes/tasks.ts` — rewritten: recurrence on create, cycling complete, schedule/unschedule/snooze endpoints
- `src/shared/src/schemas.ts` — extended with `TaskIdParamsSchema`, `ScheduleTaskBodySchema`, `SnoozeTaskBodySchema`; `CreateTaskBodySchema` now includes recurrence fields; `TaskResponseSchema` now includes `next_due_at`, `planned_for`, `recurrence_*`, `completion_window_days`
- `src/frontend/src/components/RecurrencePicker.tsx` — 3-tier recurrence picker (presets, mode toggle, advanced RRULE)
- `src/frontend/src/App.tsx` — grouped task list (Overdue/Eligible/Planned/Coming up), StateBadge, Schedule/Snooze buttons

**Dependencies added:** `rrule`, `date-fns`, `node-cron` (backend); `rrule`, `date-fns` (frontend); `@types/node-cron` (backend dev).

**Tests:** 57 passing (52 domain + 5 new route integration tests).

**How to apply:** Start Phase 3 (multi-user, Today screen, HA integration). Domain module is the stable core — don't change function signatures without updating tests.
