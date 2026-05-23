import type { FastifyPluginAsync } from "fastify";
import { eq, and, isNull, isNotNull, ne, or, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { RRule } from "rrule";
import * as schema from "../db/schema.js";
import {
  CreateTaskBodySchema,
  UpdateTaskBodySchema,
  CompleteTaskParamsSchema,
  TaskIdParamsSchema,
  ScheduleTaskBodySchema,
  SnoozeTaskBodySchema,
  GetTasksQuerySchema,
} from "@teko/shared";
import {
  computeNextDueAt,
  computeTaskState,
  computeWindowEnd,
  isWithinCompletionWindow,
  suggestCompletionWindow,
} from "../domain/recurrence.js";
import { taskToResponse } from "./taskResponseHelper.js";
import type { Db } from "../db/client.js";
import "../types.js";

function normalizeRrule(ruleStr: string, dtstart: Date): string {
  const parsed = RRule.fromString(ruleStr);
  return new RRule({ ...parsed.origOptions, dtstart }).toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAllDescendants(db: Db, rootId: string): (typeof schema.tasks.$inferSelect)[] {
  const result: (typeof schema.tasks.$inferSelect)[] = [];
  const queue = [rootId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const children = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.parent_id, currentId))
      .all();

    for (const child of children) {
      result.push(child);
      queue.push(child.id);
    }
  }

  return result;
}

function getDescendantIds(db: Db, taskId: string): string[] {
  return getAllDescendants(db, taskId).map((d) => d.id);
}

function buildChildCountMap(db: Db): Map<string, number> {
  const rows = db
    .select({
      parent_id: schema.tasks.parent_id,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.tasks)
    .where(and(isNotNull(schema.tasks.parent_id), isNull(schema.tasks.archived_at)))
    .groupBy(schema.tasks.parent_id)
    .all();

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.parent_id) map.set(r.parent_id, r.count);
  }
  return map;
}

function buildParentTitleMap(db: Db, parentIds: string[]): Map<string, string> {
  if (parentIds.length === 0) return new Map();
  const rows = db
    .select({ id: schema.tasks.id, title: schema.tasks.title })
    .from(schema.tasks)
    .where(inArray(schema.tasks.id, parentIds))
    .all();
  return new Map(rows.map((r) => [r.id, r.title]));
}

// After completing a task, walk upward and auto-complete any ancestor whose
// auto_complete_when_children_done setting is on and all direct children done.
// Collects all eligible ancestors first (tracking pending completions) then
// writes everything in a single transaction for atomicity.
function checkAndAutoCompleteAncestors(db: Db, parentId: string, userId: string, now: Date): void {
  const toComplete: (typeof schema.tasks.$inferSelect)[] = [];
  const pendingDoneIds = new Set<string>();
  let currentParentId: string | null = parentId;

  while (currentParentId) {
    const parent = db.select().from(schema.tasks).where(eq(schema.tasks.id, currentParentId)).get();
    if (!parent || parent.state === "done" || parent.archived_at !== null) break;
    if (!parent.auto_complete_when_children_done) break;

    const directChildren = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.parent_id, parent.id))
      .all();

    if (directChildren.length === 0) break;

    const allDone = directChildren.every(
      (c) => c.state === "done" || c.archived_at !== null || pendingDoneIds.has(c.id),
    );
    if (!allDone) break;

    toComplete.push(parent);
    pendingDoneIds.add(parent.id);
    currentParentId = parent.parent_id;
  }

  if (toComplete.length === 0) return;

  db.transaction((tx) => {
    for (const parent of toComplete) {
      tx.insert(schema.completions)
        .values({
          id: randomUUID(),
          task_id: parent.id,
          completed_by: userId,
          completed_at: now,
          was_on_time: null,
        })
        .run();
      tx.update(schema.tasks).set({ state: "done" }).where(eq(schema.tasks.id, parent.id)).run();
    }
  });
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const tasks: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/tasks ──────────────────────────────────────────────────────────
  // ?assignee=mine (default) | me | unassigned | all | <uuid>
  // ?scope=all (default) | leaves | top_level

  fastify.get("/api/tasks", async (request, reply) => {
    const query = GetTasksQuerySchema.safeParse(request.query);
    if (!query.success) {
      const hasParams =
        typeof request.query === "object" &&
        request.query !== null &&
        Object.keys(request.query as object).length > 0;
      if (hasParams) {
        return reply.code(400).send({ error: "Invalid query", details: query.error.flatten() });
      }
    }
    const assignee = query.success ? (query.data.assignee ?? "mine") : "mine";
    const scope = query.success ? (query.data.scope ?? "all") : "all";

    const scopeConditions: Parameters<typeof and>[0][] = [
      isNull(schema.tasks.archived_at),
      ne(schema.tasks.state, "done"),
    ];

    if (scope === "leaves") {
      scopeConditions.push(
        sql`${schema.tasks.id} NOT IN (
          SELECT DISTINCT parent_id FROM tasks
          WHERE parent_id IS NOT NULL AND archived_at IS NULL
        )`,
      );
    } else if (scope === "top_level") {
      scopeConditions.push(isNull(schema.tasks.parent_id));
    }

    const baseWhere = and(...scopeConditions);

    let rows;
    if (assignee === "mine") {
      rows = db
        .select()
        .from(schema.tasks)
        .where(
          and(
            baseWhere,
            or(eq(schema.tasks.assignee_id, request.user.id), isNull(schema.tasks.assignee_id)),
          ),
        )
        .all();
    } else if (assignee === "me") {
      rows = db
        .select()
        .from(schema.tasks)
        .where(and(baseWhere, eq(schema.tasks.assignee_id, request.user.id)))
        .all();
    } else if (assignee === "unassigned") {
      rows = db
        .select()
        .from(schema.tasks)
        .where(and(baseWhere, isNull(schema.tasks.assignee_id)))
        .all();
    } else if (assignee === "all") {
      rows = db.select().from(schema.tasks).where(baseWhere).all();
    } else {
      rows = db
        .select()
        .from(schema.tasks)
        .where(and(baseWhere, eq(schema.tasks.assignee_id, assignee)))
        .all();
    }

    const now = new Date();
    const childCounts = buildChildCountMap(db);
    const parentIds = [...new Set(rows.filter((r) => r.parent_id).map((r) => r.parent_id!))];
    const parentTitles = buildParentTitleMap(db, parentIds);

    return rows.map((t) =>
      taskToResponse(t, now, {
        childCount: childCounts.get(t.id) ?? 0,
        parentTitle: t.parent_id ? (parentTitles.get(t.parent_id) ?? null) : null,
      }),
    );
  });

  // ── POST /api/tasks ─────────────────────────────────────────────────────────

  fastify.post("/api/tasks", async (request, reply) => {
    const parsed = CreateTaskBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const {
      title,
      description,
      assignee_id,
      parent_id,
      recurrence_rule,
      recurrence_mode,
      completion_window_days,
    } = parsed.data;

    if (parent_id) {
      const parent = db.select().from(schema.tasks).where(eq(schema.tasks.id, parent_id)).get();
      if (!parent) return reply.code(404).send({ error: "Parent task not found" });
      if (parent.archived_at !== null)
        return reply.code(409).send({ error: "Parent task is archived" });
    }

    const id = randomUUID();
    const now = new Date();

    let nextDueAt: Date | null = null;
    let windowDays: number | null = completion_window_days ?? null;
    let normalizedRule: string | null = recurrence_rule ?? null;
    let initialState: "eligible" | "not_yet" = "eligible";

    if (recurrence_rule && recurrence_mode) {
      const taskForDue = { recurrence_rule, recurrence_mode, next_due_at: null };
      nextDueAt = computeNextDueAt(taskForDue, null, now);
      normalizedRule = normalizeRrule(recurrence_rule, nextDueAt);
      if (windowDays === null) {
        windowDays = suggestCompletionWindow(recurrence_rule);
      }
      const computed = computeTaskState(
        {
          archived_at: null,
          state: "eligible",
          recurrence_rule: normalizedRule,
          next_due_at: nextDueAt,
          completion_window_days: windowDays,
          planned_for: null,
        },
        now,
      );
      initialState = computed === "not_yet" ? "not_yet" : "eligible";
    }

    const resolvedAssignee = assignee_id === null ? null : (assignee_id ?? request.user.id);

    db.insert(schema.tasks)
      .values({
        id,
        title,
        description: description ?? null,
        assignee_id: resolvedAssignee,
        parent_id: parent_id ?? null,
        created_by: request.user.id,
        state: initialState,
        recurrence_rule: normalizedRule,
        recurrence_mode: recurrence_mode ?? null,
        completion_window_days: windowDays,
        next_due_at: nextDueAt,
      })
      .run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    if (!task) return reply.code(500).send({ error: "Failed to retrieve created task" });

    return reply.code(201).send(taskToResponse(task, new Date()));
  });

  // ── PATCH /api/tasks/:id ────────────────────────────────────────────────────

  fastify.patch("/api/tasks/:id", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const body = UpdateTaskBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const updates: Partial<typeof schema.tasks.$inferInsert> = {};
    if (body.data.title !== undefined) updates.title = body.data.title;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if ("assignee_id" in body.data) updates.assignee_id = body.data.assignee_id ?? null;
    if (body.data.auto_complete_when_children_done !== undefined) {
      updates.auto_complete_when_children_done = body.data.auto_complete_when_children_done;
    }

    if ("parent_id" in body.data) {
      const newParentId = body.data.parent_id ?? null;

      if (newParentId !== null) {
        if (newParentId === task.id) {
          return reply.code(422).send({ error: "Task cannot be its own parent" });
        }
        const descendantIds = getDescendantIds(db, task.id);
        if (descendantIds.includes(newParentId)) {
          return reply.code(422).send({ error: "Moving task would create a cycle" });
        }
        const parent = db.select().from(schema.tasks).where(eq(schema.tasks.id, newParentId)).get();
        if (!parent) return reply.code(404).send({ error: "Parent task not found" });
        if (parent.archived_at !== null)
          return reply.code(409).send({ error: "Parent task is archived" });
      }

      updates.parent_id = newParentId;
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(200).send(taskToResponse(task, new Date()));
    }

    db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, task.id)).run();

    const updated = db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get();
    if (!updated) return reply.code(500).send({ error: "Failed to retrieve updated task" });

    const childCounts = buildChildCountMap(db);
    const parentTitle = updated.parent_id
      ? (db
          .select({ title: schema.tasks.title })
          .from(schema.tasks)
          .where(eq(schema.tasks.id, updated.parent_id))
          .get()?.title ?? null)
      : null;
    return reply.code(200).send(
      taskToResponse(updated, new Date(), {
        childCount: childCounts.get(updated.id) ?? 0,
        parentTitle,
      }),
    );
  });

  // ── POST /api/tasks/:id/complete ────────────────────────────────────────────

  fastify.post("/api/tasks/:id/complete", async (request, reply) => {
    const parsed = CompleteTaskParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, parsed.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.state === "done") return reply.code(409).send({ error: "Task already completed" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const now = new Date();
    const wasOnTime = isWithinCompletionWindow(task, now);
    const isRecurring = task.recurrence_rule !== null && task.recurrence_mode !== null;

    db.transaction((tx) => {
      tx.insert(schema.completions)
        .values({
          id: randomUUID(),
          task_id: task.id,
          completed_by: request.user.id,
          completed_at: now,
          was_on_time: wasOnTime,
          cycle_due_at: task.next_due_at,
        })
        .run();

      if (isRecurring) {
        const nextDueAt = computeNextDueAt(task, now, now);
        const nextStateInput = {
          archived_at: null,
          state: "not_yet" as const,
          recurrence_rule: task.recurrence_rule,
          next_due_at: nextDueAt,
          completion_window_days: task.completion_window_days,
          planned_for: null,
        };
        const computed = computeTaskState(nextStateInput, now);
        const nextState =
          computed === "archived" || computed === "done" ? ("not_yet" as const) : computed;

        tx.update(schema.tasks)
          .set({ next_due_at: nextDueAt, planned_for: null, state: nextState })
          .where(eq(schema.tasks.id, task.id))
          .run();
      } else {
        tx.update(schema.tasks).set({ state: "done" }).where(eq(schema.tasks.id, task.id)).run();
      }
    });

    // Walk upward: auto-complete ancestors whose all children are now done
    if (task.parent_id && !isRecurring) {
      checkAndAutoCompleteAncestors(db, task.parent_id, request.user.id, now);
    }

    return reply.code(204).send();
  });

  // ── POST /api/tasks/:id/archive ─────────────────────────────────────────────

  fastify.post("/api/tasks/:id/archive", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task already archived" });

    const now = new Date();
    const descendantIds = getDescendantIds(db, task.id);

    db.transaction((tx) => {
      tx.update(schema.tasks).set({ archived_at: now }).where(eq(schema.tasks.id, task.id)).run();

      if (descendantIds.length > 0) {
        tx.update(schema.tasks)
          .set({ archived_at: now })
          .where(and(inArray(schema.tasks.id, descendantIds), isNull(schema.tasks.archived_at)))
          .run();
      }
    });

    return reply.code(204).send();
  });

  // ── POST /api/tasks/:id/unarchive ───────────────────────────────────────────

  fastify.post("/api/tasks/:id/unarchive", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at === null) return reply.code(409).send({ error: "Task is not archived" });

    db.update(schema.tasks).set({ archived_at: null }).where(eq(schema.tasks.id, task.id)).run();

    return reply.code(204).send();
  });

  // ── POST /api/tasks/:id/schedule ────────────────────────────────────────────

  fastify.post("/api/tasks/:id/schedule", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const body = ScheduleTaskBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const plannedFor = new Date(body.data.planned_for);

    let warning: string | undefined;
    if (task.next_due_at !== null) {
      const windowEnd = computeWindowEnd(task.next_due_at, task.completion_window_days ?? 0);
      if (plannedFor >= windowEnd) {
        warning = "planned_for is past the completion window end";
      }
    }

    db.update(schema.tasks)
      .set({ planned_for: plannedFor, state: "planned" })
      .where(eq(schema.tasks.id, task.id))
      .run();

    return reply.code(200).send(warning ? { warning } : {});
  });

  // ── POST /api/tasks/:id/unschedule ──────────────────────────────────────────

  fastify.post("/api/tasks/:id/unschedule", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const now = new Date();
    const newState = computeTaskState({ ...task, planned_for: null }, now);
    const state = newState === "archived" || newState === "done" ? task.state : newState;

    db.update(schema.tasks)
      .set({ planned_for: null, state })
      .where(eq(schema.tasks.id, task.id))
      .run();

    return reply.code(204).send();
  });

  // ── POST /api/tasks/:id/snooze ──────────────────────────────────────────────

  fastify.post("/api/tasks/:id/snooze", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const body = SnoozeTaskBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const until = new Date(body.data.until);
    const now = new Date();

    const newState = computeTaskState({ ...task, next_due_at: until, planned_for: null }, now);
    const state = newState === "archived" || newState === "done" ? ("not_yet" as const) : newState;

    db.update(schema.tasks)
      .set({ next_due_at: until, planned_for: null, state })
      .where(eq(schema.tasks.id, task.id))
      .run();

    return reply.code(204).send();
  });
};

export default tasks;
