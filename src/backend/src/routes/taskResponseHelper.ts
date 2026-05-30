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

/** A Someday item: non-recurring, no due date, not archived, not done. */
function computeIsSomeday(t: typeof schema.tasks.$inferSelect): boolean {
  return (
    t.recurrence_rule === null && t.due_at === null && t.archived_at === null && t.state !== "done"
  );
}

export function taskToResponse(
  t: typeof schema.tasks.$inferSelect,
  now: Date,
  opts: { assigneeName?: string | null } = {},
) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assignee_id: t.assignee_id,
    assignee_name: opts.assigneeName ?? null,
    state: computeTaskState(t, now),
    created_at: t.created_at,
    created_by: t.created_by,
    points: t.points,
    tags: t.tags,
    recurrence_rule: t.recurrence_rule,
    recurrence_mode: t.recurrence_mode,
    completion_window_days: t.completion_window_days,
    due_at: t.due_at,
    archived_at: t.archived_at,
    is_someday: computeIsSomeday(t),
  };
}
