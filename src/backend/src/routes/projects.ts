import type { FastifyPluginAsync } from "fastify";
import { eq, and, isNull, isNotNull, inArray, desc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { TaskIdParamsSchema, GetTasksQuerySchema } from "@teko/shared";
import { getNow } from "../domain/clock.js";
import { computeProjectProgress } from "../domain/project.js";
import { getAllDescendants } from "./tasks.js";
import { taskToResponse } from "./taskResponseHelper.js";
import "../types.js";
import type { Db } from "../db/client.js";

function getLastActivityAt(db: Db, allTaskIds: string[]): Date | null {
  if (allTaskIds.length === 0) return null;
  const latest = db
    .select({ completed_at: schema.completions.completed_at })
    .from(schema.completions)
    .where(inArray(schema.completions.task_id, allTaskIds))
    .orderBy(desc(schema.completions.completed_at))
    .limit(1)
    .get();
  return latest?.completed_at ?? null;
}

const projects: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/projects ───────────────────────────────────────────────────────
  // Top-level projects: tasks with children, parent_id IS NULL.
  // Supports same ?assignee filter as /api/tasks.

  fastify.get("/api/projects", async (request, reply) => {
    const query = GetTasksQuerySchema.safeParse(request.query);
    const assignee = query.success ? (query.data.assignee ?? "mine") : "mine";

    // Find all task IDs referenced as parent_id (these are projects)
    const parentIdRows = db
      .selectDistinct({ id: schema.tasks.parent_id })
      .from(schema.tasks)
      .where(and(isNotNull(schema.tasks.parent_id), isNull(schema.tasks.archived_at)))
      .all();

    const projectIdSet = new Set(parentIdRows.map((r) => r.id!));
    if (projectIdSet.size === 0) return reply.send([]);

    const projectIds = [...projectIdSet];

    // Base filter: top-level (no parent), non-archived, is a project
    const baseConditions = [
      isNull(schema.tasks.parent_id),
      isNull(schema.tasks.archived_at),
      inArray(schema.tasks.id, projectIds),
    ] as const;

    let rows: (typeof schema.tasks.$inferSelect)[];

    if (assignee === "mine") {
      rows = db
        .select()
        .from(schema.tasks)
        .where(
          and(
            ...baseConditions,
            sql`(${schema.tasks.assignee_id} IS NULL OR ${schema.tasks.assignee_id} = ${request.user.id})`,
          ),
        )
        .all();
    } else if (assignee === "me") {
      rows = db
        .select()
        .from(schema.tasks)
        .where(and(...baseConditions, eq(schema.tasks.assignee_id, request.user.id)))
        .all();
    } else if (assignee === "all") {
      rows = db
        .select()
        .from(schema.tasks)
        .where(and(...baseConditions))
        .all();
    } else {
      rows = db
        .select()
        .from(schema.tasks)
        .where(and(...baseConditions, eq(schema.tasks.assignee_id, assignee)))
        .all();
    }

    const now = getNow();

    return rows.map((project) => {
      const descendants = getAllDescendants(db, project.id);
      const progress = computeProjectProgress(
        descendants.map((d) => ({
          id: d.id,
          parent_id: d.parent_id,
          state: d.state,
          archived_at: d.archived_at,
          auto_complete_when_children_done: d.auto_complete_when_children_done,
        })),
      );
      const directChildCount = descendants.filter((d) => d.parent_id === project.id).length;
      const allTaskIds = [project.id, ...descendants.map((d) => d.id)];
      const lastActivityAt = getLastActivityAt(db, allTaskIds);

      return {
        ...taskToResponse(project, now, { childCount: directChildCount }),
        progress,
        last_activity_at: lastActivityAt,
      };
    });
  });

  // ── GET /api/tasks/:id/tree ─────────────────────────────────────────────────
  // Returns the root task + all descendants as a flat array.
  // Each item includes child_count so the frontend can build the tree structure.

  fastify.get("/api/tasks/:id/tree", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const root = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!root) return reply.code(404).send({ error: "Task not found" });

    const descendants = getAllDescendants(db, root.id);
    const allNodes = [root, ...descendants];

    // Build child count map from the descendants
    const childCounts = new Map<string, number>();
    for (const d of descendants) {
      if (d.parent_id) {
        childCounts.set(d.parent_id, (childCounts.get(d.parent_id) ?? 0) + 1);
      }
    }

    const now = getNow();
    return allNodes.map((t) => taskToResponse(t, now, { childCount: childCounts.get(t.id) ?? 0 }));
  });

  // ── GET /api/tasks/:id/children ─────────────────────────────────────────────
  // Direct children only (one level). Used for lazy-loading.

  fastify.get("/api/tasks/:id/children", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const parent = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!parent) return reply.code(404).send({ error: "Task not found" });

    const children = db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.parent_id, params.data.id), isNull(schema.tasks.archived_at)))
      .all();

    if (children.length === 0) return reply.send([]);

    const childIds = children.map((c) => c.id);

    // Count grandchildren (one query)
    const grandchildRows = db
      .select({
        parent_id: schema.tasks.parent_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.tasks)
      .where(and(inArray(schema.tasks.parent_id, childIds), isNull(schema.tasks.archived_at)))
      .groupBy(schema.tasks.parent_id)
      .all();

    const grandchildCounts = new Map<string, number>();
    for (const r of grandchildRows) {
      if (r.parent_id) grandchildCounts.set(r.parent_id, r.count);
    }

    const now = getNow();
    return children.map((c) =>
      taskToResponse(c, now, {
        childCount: grandchildCounts.get(c.id) ?? 0,
        parentTitle: parent.title,
      }),
    );
  });
};

export default projects;
