import { sql, inArray } from "drizzle-orm";
import * as schema from "./schema.js";
import type { Db } from "./client.js";

type TaskRow = typeof schema.tasks.$inferSelect;

/**
 * Returns all descendants (excluding the root itself) for each given root,
 * collected in a single recursive CTE plus one typed select. O(1) queries
 * regardless of subtree depth, replacing per-level BFS.
 */
export function fetchSubtreesByRoot(db: Db, rootIds: string[]): Map<string, TaskRow[]> {
  const result = new Map<string, TaskRow[]>();
  for (const id of rootIds) result.set(id, []);
  if (rootIds.length === 0) return result;

  const idList = sql.join(
    rootIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const edges = db.all(sql`
    WITH RECURSIVE subtree(root_id, id) AS (
      SELECT id AS root_id, id FROM tasks WHERE id IN (${idList})
      UNION ALL
      SELECT s.root_id, t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
    )
    SELECT root_id, id FROM subtree WHERE id != root_id
  `) as Array<{ root_id: string; id: string }>;

  if (edges.length === 0) return result;

  const descendantIds = [...new Set(edges.map((e) => e.id))];
  const descendantRows = db
    .select()
    .from(schema.tasks)
    .where(inArray(schema.tasks.id, descendantIds))
    .all();
  const rowById = new Map(descendantRows.map((r) => [r.id, r]));

  for (const edge of edges) {
    const row = rowById.get(edge.id);
    if (!row) continue;
    const list = result.get(edge.root_id);
    if (list) list.push(row);
  }

  return result;
}

/**
 * Single-root convenience wrapper.
 */
export function fetchDescendants(db: Db, rootId: string): TaskRow[] {
  return fetchSubtreesByRoot(db, [rootId]).get(rootId) ?? [];
}
