# ADR-0006: Replace Projects with a Someday list

**Date:** 2026-05-30  
**Status:** Accepted  
**Supersedes (in part):** [ADR-0003](0003-unified-task-model.md) — the unified task entity stands; the Project shape does not.

## Context

Phase 4 implemented Projects as hierarchical tasks: a task became a "project" by having children, auto-completion cascaded upward, and a progress bar tracked completion across descendants. The two columns that supported this were `parent_id` (self-referential FK) and `auto_complete_when_children_done`.

Real use revealed that hierarchical, structured planning is not how household long-term work actually gets tracked. What's needed is a GTD-style someday list: a flat inventory of intentions and ideas, browsed deliberately, never pushed into the daily feed. Something like "renovate the basement" or "fix the squeaky hinge in the office" — concrete or vague, big or small — that you want to capture without it cluttering Today.

## Decision

Remove Projects entirely (the two schema columns, all routes, all domain logic, all UI surfaces). Introduce a Someday area as a flat top-level view.

A **Someday item** is just a task with no recurrence rule, no next_due_at, and no planned_for — already the natural state of a dateless one-off task. No new columns are needed.

- **Scheduling** a Someday item = setting `planned_for` via the existing `/schedule` endpoint. The item leaves Someday and appears in the normal active task flow.
- **Moving to Someday** = clearing `planned_for` via the existing `/unschedule` endpoint. The item returns to Someday with its title, description, and assignee intact.
- **Scope discrimination**: `GET /api/tasks?scope=someday` returns dateless non-recurring tasks; `scope=active` (the new default) excludes them. No new endpoints.

If someone wants to break a vague Someday item into concrete ones, they add several new items and archive the original. The system does not model this as a state transition.

## Consequences

- The data model is simpler: one fewer self-referential FK, no cascade logic, no cycle-prevention code.
- The unified task entity (ADR-0003) is reinforced — one shape, one set of routes.
- Hierarchy is gone. If a future feature genuinely requires it, it needs a fresh ADR and a fresh design — not a revival of Projects.
- Tags (planned as a follow-up) will provide loose grouping within the Someday list without hierarchy.

## Alternatives considered

- **Keep Projects alongside Someday**: rejected. Two parallel grouping mechanisms is more cognitive load, not less. The two concepts competed rather than complemented.
- **Generalise Projects into something richer**: rejected as premature abstraction without real-use validation.
- **Someday as a filter rather than a top-level nav item**: rejected. Someday is a destination visited deliberately, not a slice applied to the existing views. Giving it a dedicated nav entry makes the deliberateness explicit.
