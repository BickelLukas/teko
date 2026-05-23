# ADR-0003: One unified task model for chores, projects, and one-off tasks

**Date:** 2026-05-23  
**Status:** Accepted

## Context

Teko handles three conceptually distinct things:

- **Chores** — recurring tasks with streaks, points, and notification rhythm
- **Projects** — hierarchical, ad-hoc, can contain sub-tasks
- **One-off tasks** — simple to-dos, no recurrence, no hierarchy

These could be modeled as three separate entities (each with their own table, routes, and logic) or as one entity with discriminator fields.

## Decision

Use a single `tasks` entity. Type is computed from two fields:

- A task with a `recurrence_rule` is a **chore**.
- A task with a `parent_id` is a **child of a project**.
- A task with `children` (tasks referencing it as parent) is a **project**.
- A task with neither is a **one-off task**.

The UX presents chores and projects as distinct concepts. The data layer treats them uniformly.

## Consequences

**Positive:**
- One set of routes, one set of services, one assignment and completion path. No duplicated logic.
- Promoting a one-off task to a project (adding a child) requires no migration — just an insert.
- A task can have *both* a recurrence and a parent (a recurring sub-task within a project) without special handling.
- Events, notifications, and HA exposure work the same for all task shapes.

**Negative:**
- Queries that want only "chores" or only "projects" need filtering by computed type.
- Slightly more discipline required to keep UX surfaces presenting the correct subset.

## Alternatives considered

- **Three separate tables** (`chores`, `projects`, `tasks`): rejected. Estimated 60%+ code duplication across recurrence handling, assignment, completion attribution, notifications, and HA exposure. The marginal clarity of "this table contains only chores" is not worth the maintenance cost.
- **A `type` enum column**: rejected because the type is derivable from existing fields. Storing it adds a consistency burden (what if `type='chore'` but `recurrence_rule IS NULL`?) without benefit.