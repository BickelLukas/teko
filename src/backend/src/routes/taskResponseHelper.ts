import * as schema from "../db/schema.js";
import { inArray } from "drizzle-orm";
import { computeTaskState } from "../domain/recurrence.js";
import type { Db } from "../db/client.js";

export function buildAssigneeNameMap(db: Db, assigneeIds: string[]): Map<string, string> {
  if (assigneeIds.length === 0) return new Map();
  const rows = db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      display_name: schema.users.display_name,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, assigneeIds))
    .all();
  return new Map(rows.map((r) => [r.id, r.display_name ?? r.name]));
}

export function taskToResponse(
  t: typeof schema.tasks.$inferSelect,
  now: Date,
  opts: { childCount?: number; parentTitle?: string | null; assigneeName?: string | null } = {},
) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assignee_id: t.assignee_id,
    assignee_name: opts.assigneeName ?? null,
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
