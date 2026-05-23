import type * as schema from "../db/schema.js";
import { computeTaskState } from "../domain/recurrence.js";

export function taskToResponse(
  t: typeof schema.tasks.$inferSelect,
  now: Date,
  opts: { childCount?: number; parentTitle?: string | null } = {},
) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assignee_id: t.assignee_id,
    parent_id: t.parent_id,
    parent_title: opts.parentTitle ?? null,
    state: computeTaskState(t, now),
    created_at: t.created_at,
    created_by: t.created_by,
    points: t.points,
    tags: t.tags,
    recurrence_rule: t.recurrence_rule,
    recurrence_mode: t.recurrence_mode,
    completion_window_days: t.completion_window_days,
    next_due_at: t.next_due_at,
    planned_for: t.planned_for,
    auto_complete_when_children_done: t.auto_complete_when_children_done,
    child_count: opts.childCount ?? 0,
    archived_at: t.archived_at,
  };
}
