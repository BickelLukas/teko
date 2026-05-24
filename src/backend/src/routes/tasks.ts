import type { FastifyPluginAsync } from "fastify";
import { eq, and, isNull, isNotNull, ne, or, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { RRule } from "rrule";
import * as schema from "../db/schema.js";
import { getNow } from "../domain/clock.js";
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
import { computeStreakUpdate, awardPoints, detectStreakMilestone } from "../domain/streaks.js";
import { taskToResponse, buildAssigneeNameMap } from "./taskResponseHelper.js";
import { fetchDescendants } from "../db/queries.js";
import type { Db } from "../db/client.js";
import "../types.js";

function normalizeRrule(ruleStr: string, dtstart: Date): string {
  const parsed = RRule.fromString(ruleStr);
  return new RRule({ ...parsed.origOptions, dtstart }).toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDescendantIds(db: Db, taskId: string): string[] {
  return fetchDescendants(db, taskId).map((d) => d.id);
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

    const now = getNow();
    const childCounts = buildChildCountMap(db);
    const parentIds = [...new Set(rows.filter((r) => r.parent_id).map((r) => r.parent_id!))];
    const parentTitles = buildParentTitleMap(db, parentIds);
    const assigneeIds = [...new Set(rows.filter((r) => r.assignee_id).map((r) => r.assignee_id!))];
    const assigneeNames = buildAssigneeNameMap(db, assigneeIds);

    return rows.map((t) =>
      taskToResponse(t, now, {
        childCount: childCounts.get(t.id) ?? 0,
        parentTitle: t.parent_id ? (parentTitles.get(t.parent_id) ?? null) : null,
        assigneeName: t.assignee_id ? (assigneeNames.get(t.assignee_id) ?? null) : null,
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
      start_date,
    } = parsed.data;

    if (parent_id) {
      const parent = db.select().from(schema.tasks).where(eq(schema.tasks.id, parent_id)).get();
      if (!parent) return reply.code(404).send({ error: "Parent task not found" });
      if (parent.archived_at !== null)
        return reply.code(409).send({ error: "Parent task is archived" });
    }

    const id = randomUUID();
    const now = getNow();

    // Parse optional start date anchor (noon UTC to avoid DST edge cases)
    let anchor: Date | null = null;
    if (start_date) {
      anchor = new Date(`${start_date}T12:00:00Z`);
      const todayNoon = new Date(`${now.toISOString().split("T")[0]}T12:00:00Z`);
      if (anchor < todayNoon) {
        return reply.code(400).send({ error: "start_date cannot be in the past" });
      }
    }

    let nextDueAt: Date | null = null;
    let windowDays: number | null = completion_window_days ?? null;
    let normalizedRule: string | null = recurrence_rule ?? null;
    let initialState: "eligible" | "not_yet" | "planned" = "eligible";
    let plannedFor: Date | null = null;

    if (recurrence_rule && recurrence_mode) {
      const effectiveNow = anchor ?? now;

      if (recurrence_mode === "after_completion" && anchor !== null) {
        // User chose an anchor date: treat it as the first due date directly.
        // Standard creation (no anchor) would compute anchor+interval, which is wrong here.
        nextDueAt = anchor;
      } else {
        const taskForDue = { recurrence_rule, recurrence_mode, next_due_at: null };
        nextDueAt = computeNextDueAt(taskForDue, null, effectiveNow);
      }

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
    } else if (anchor !== null && anchor > now) {
      // One-off task with a future start date: schedule it directly.
      plannedFor = anchor;
      initialState = "planned";
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
        planned_for: plannedFor,
      })
      .run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    if (!task) return reply.code(500).send({ error: "Failed to retrieve created task" });

    const assigneeNames = buildAssigneeNameMap(db, task.assignee_id ? [task.assignee_id] : []);
    return reply.code(201).send(
      taskToResponse(task, getNow(), {
        assigneeName: task.assignee_id ? (assigneeNames.get(task.assignee_id) ?? null) : null,
      }),
    );
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

    const recurrenceRuleChanged = body.data.recurrence_rule !== undefined;
    const recurrenceModeChanged = body.data.recurrence_mode !== undefined;
    const windowChanged = body.data.completion_window_days !== undefined;

    if (recurrenceRuleChanged || recurrenceModeChanged) {
      const newRule: string | null =
        body.data.recurrence_rule !== undefined ? body.data.recurrence_rule : task.recurrence_rule;
      const newMode: "fixed" | "after_completion" | null =
        body.data.recurrence_mode !== undefined ? body.data.recurrence_mode : task.recurrence_mode;

      if (newRule === null || newMode === null) {
        updates.recurrence_rule = null;
        updates.recurrence_mode = null;
        updates.completion_window_days = null;
        updates.next_due_at = null;
        if (task.state !== "done") updates.state = "eligible";
      } else {
        const now = getNow();
        const lastCompletion = db
          .select({ completed_at: schema.completions.completed_at })
          .from(schema.completions)
          .where(eq(schema.completions.task_id, task.id))
          .orderBy(sql`${schema.completions.completed_at} DESC`)
          .limit(1)
          .get();

        const anchor =
          newMode === "after_completion" && lastCompletion ? lastCompletion.completed_at : null;
        const nextDueAt = computeNextDueAt(
          { recurrence_rule: newRule, recurrence_mode: newMode, next_due_at: null },
          anchor,
          now,
        );
        const normalizedRule = normalizeRrule(newRule, nextDueAt ?? now);

        const windowDays: number | null = windowChanged
          ? (body.data.completion_window_days ?? null)
          : (task.completion_window_days ?? suggestCompletionWindow(newRule));

        const computedState = computeTaskState(
          {
            archived_at: null,
            state: "eligible",
            recurrence_rule: normalizedRule,
            next_due_at: nextDueAt,
            completion_window_days: windowDays,
            planned_for: task.planned_for,
          },
          now,
        );

        updates.recurrence_rule = normalizedRule;
        updates.recurrence_mode = newMode;
        updates.completion_window_days = windowDays;
        updates.next_due_at = nextDueAt;
        if (task.state !== "done") {
          updates.state = computedState === "not_yet" ? "not_yet" : "eligible";
        }
      }
    } else if (windowChanged) {
      updates.completion_window_days = body.data.completion_window_days ?? null;
    }

    if (Object.keys(updates).length === 0) {
      const assigneeNamesNoOp = buildAssigneeNameMap(
        db,
        task.assignee_id ? [task.assignee_id] : [],
      );
      return reply.code(200).send(
        taskToResponse(task, getNow(), {
          assigneeName: task.assignee_id ? (assigneeNamesNoOp.get(task.assignee_id) ?? null) : null,
        }),
      );
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
    const assigneeNamesUpdated = buildAssigneeNameMap(
      db,
      updated.assignee_id ? [updated.assignee_id] : [],
    );
    return reply.code(200).send(
      taskToResponse(updated, getNow(), {
        childCount: childCounts.get(updated.id) ?? 0,
        parentTitle,
        assigneeName: updated.assignee_id
          ? (assigneeNamesUpdated.get(updated.assignee_id) ?? null)
          : null,
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

    const now = getNow();
    const wasOnTime = isWithinCompletionWindow(task, now);
    const isRecurring = task.recurrence_rule !== null && task.recurrence_mode !== null;
    const pointsAwarded = awardPoints(task);
    const cycleDueAt = task.next_due_at;

    // Reserve the cycle with a conditional update. Guards against two concurrent
    // completes both passing the state read above and double-cycling the task.
    // For one-off: claim by flipping state to "done" only if not already done.
    // For recurring: claim by replacing next_due_at only if it still matches
    // the value we read (a parallel completer would have already advanced it).
    const reserved = isRecurring
      ? (() => {
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

          const result = db
            .update(schema.tasks)
            .set({ next_due_at: nextDueAt, planned_for: null, state: nextState })
            .where(
              and(
                eq(schema.tasks.id, task.id),
                cycleDueAt === null
                  ? isNull(schema.tasks.next_due_at)
                  : eq(schema.tasks.next_due_at, cycleDueAt),
                ne(schema.tasks.state, "done"),
                isNull(schema.tasks.archived_at),
              ),
            )
            .run();
          return { claimed: result.changes > 0, nextDueAt };
        })()
      : (() => {
          const result = db
            .update(schema.tasks)
            .set({ state: "done" })
            .where(
              and(
                eq(schema.tasks.id, task.id),
                ne(schema.tasks.state, "done"),
                isNull(schema.tasks.archived_at),
              ),
            )
            .run();
          return { claimed: result.changes > 0, nextDueAt: null };
        })();

    if (!reserved.claimed) {
      return reply.code(409).send({ error: "Task already completed" });
    }

    // Read current streak after claiming the cycle
    const currentStreak = isRecurring
      ? db
          .select()
          .from(schema.streaks)
          .where(
            and(eq(schema.streaks.task_id, task.id), eq(schema.streaks.user_id, request.user.id)),
          )
          .get()
      : null;

    const oldLength = currentStreak?.current_length ?? 0;
    const oldLongest = currentStreak?.longest_length ?? 0;
    const streakUpdate = isRecurring
      ? computeStreakUpdate({ current_length: oldLength, longest_length: oldLongest }, wasOnTime)
      : { current_length: 0, longest_length: 0 };
    const { current_length: newLength, longest_length: newLongest } = streakUpdate;
    const milestoneReached = isRecurring ? detectStreakMilestone(oldLength, newLength) : null;

    db.transaction((tx) => {
      tx.insert(schema.completions)
        .values({
          id: randomUUID(),
          task_id: task.id,
          completed_by: request.user.id,
          completed_at: now,
          was_on_time: wasOnTime,
          cycle_due_at: cycleDueAt,
          points_awarded: pointsAwarded,
        })
        .run();

      if (isRecurring) {
        tx.insert(schema.streaks)
          .values({
            id: randomUUID(),
            task_id: task.id,
            user_id: request.user.id,
            current_length: newLength,
            longest_length: newLongest,
            last_completed_at: now,
          })
          .onConflictDoUpdate({
            target: [schema.streaks.task_id, schema.streaks.user_id],
            set: {
              current_length: newLength,
              longest_length: newLongest,
              last_completed_at: now,
            },
          })
          .run();
      }
    });

    if (milestoneReached !== null) {
      fastify.log.info(
        { user: request.user.id, task: task.id, title: task.title, streak: milestoneReached },
        "streak-milestone",
      );
    }

    // Walk upward: auto-complete ancestors whose all children are now done
    if (task.parent_id && !isRecurring) {
      checkAndAutoCompleteAncestors(db, task.parent_id, request.user.id, now);
    }

    const updatedTask = db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get();
    const completeAssigneeNames = buildAssigneeNameMap(
      db,
      updatedTask?.assignee_id ? [updatedTask.assignee_id] : [],
    );

    return reply.code(200).send({
      task: updatedTask
        ? taskToResponse(updatedTask, getNow(), {
            assigneeName: updatedTask.assignee_id
              ? (completeAssigneeNames.get(updatedTask.assignee_id) ?? null)
              : null,
          })
        : null,
      completion: { was_on_time: wasOnTime, points_awarded: pointsAwarded },
      streak: {
        current: newLength,
        longest: newLongest,
        milestone_reached: milestoneReached ?? null,
      },
      points_awarded: pointsAwarded,
    });
  });

  // ── POST /api/tasks/:id/archive ─────────────────────────────────────────────

  fastify.post("/api/tasks/:id/archive", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task already archived" });

    const now = getNow();
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

    const now = getNow();
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
    const now = getNow();

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
