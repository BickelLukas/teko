import type { FastifyPluginAsync } from "fastify";
import { eq, and, isNull, isNotNull, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { RRule } from "rrule";
import * as schema from "../db/schema.js";
import { getNow } from "../domain/clock.js";
import {
  CreateTaskBodySchema,
  UpdateTaskBodySchema,
  CompleteTaskParamsSchema,
  TaskIdParamsSchema,
  RescheduleTaskBodySchema,
  GetTasksQuerySchema,
} from "@teko/shared";
import {
  computeNextDueAt,
  computeTaskState,
  isOnTime,
  suggestCompletionWindow,
} from "../domain/recurrence.js";
import { computeStreakUpdate, awardPoints, detectStreakMilestone } from "../domain/streaks.js";
import { taskToResponse, buildAssigneeNameMap } from "./taskResponseHelper.js";
import "../types.js";

function normalizeRrule(ruleStr: string, dtstart: Date): string {
  const parsed = RRule.fromString(ruleStr);
  return new RRule({ ...parsed.origOptions, dtstart }).toString();
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const tasks: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/tasks ──────────────────────────────────────────────────────────
  // ?assignee=mine (default) | me | unassigned | all | <uuid>
  // ?scope=active (default) | someday | all
  //
  // active:  tasks with a recurrence rule OR a due_at set
  // someday: non-recurring tasks with no due_at (recurrence_rule IS NULL AND due_at IS NULL)
  // all:     no scope filter (both active and someday items)

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
    const scope = query.success ? (query.data.scope ?? "active") : "active";

    const baseConditions: Parameters<typeof and>[0][] = [
      isNull(schema.tasks.archived_at),
      ne(schema.tasks.state, "done"),
    ];

    if (scope === "active") {
      // Exclude Someday items: keep tasks that have recurrence OR a due_at
      baseConditions.push(
        or(isNotNull(schema.tasks.recurrence_rule), isNotNull(schema.tasks.due_at)),
      );
    } else if (scope === "someday") {
      // Only Someday items
      baseConditions.push(isNull(schema.tasks.recurrence_rule));
      baseConditions.push(isNull(schema.tasks.due_at));
    }
    // scope === "all": no additional filter

    const baseWhere = and(...baseConditions);

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
    const assigneeIds = [...new Set(rows.filter((r) => r.assignee_id).map((r) => r.assignee_id!))];
    const assigneeNames = buildAssigneeNameMap(db, assigneeIds);

    return rows.map((t) =>
      taskToResponse(t, now, {
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
      recurrence_rule,
      recurrence_mode,
      completion_window_days,
      start_date,
    } = parsed.data;

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

    let dueAt: Date | null = null;
    let windowDays: number | null = completion_window_days ?? null;
    let normalizedRule: string | null = recurrence_rule ?? null;
    let initialState: "eligible" | "not_yet" = "eligible";

    if (recurrence_rule && recurrence_mode) {
      // First occurrence is "now" (or the chosen start date) for both modes,
      // unless a calendar constraint in the rule pushes it to a later slot.
      const effectiveNow = anchor ?? now;
      const taskForDue = { recurrence_rule, recurrence_mode, due_at: null };
      dueAt = computeNextDueAt(taskForDue, null, effectiveNow);

      normalizedRule = normalizeRrule(recurrence_rule, dueAt);
      if (windowDays === null) {
        windowDays = suggestCompletionWindow(recurrence_rule);
      }
      const computed = computeTaskState(
        {
          archived_at: null,
          state: "eligible",
          recurrence_rule: normalizedRule,
          due_at: dueAt,
          completion_window_days: windowDays,
        },
        now,
      );
      initialState = computed === "not_yet" ? "not_yet" : "eligible";
    } else if (anchor !== null) {
      // One-off task with a start date: set it as the due date.
      dueAt = anchor;
      const computed = computeTaskState(
        {
          archived_at: null,
          state: "eligible",
          recurrence_rule: null,
          due_at: dueAt,
          completion_window_days: null,
        },
        now,
      );
      initialState = computed === "not_yet" ? "not_yet" : "eligible";
    }
    // A task with no recurrence and no date is a Someday item — state stays "eligible"
    // which is fine; the Someday predicate is what matters for filtering.

    const resolvedAssignee = assignee_id === null ? null : (assignee_id ?? request.user.id);

    db.insert(schema.tasks)
      .values({
        id,
        title,
        description: description ?? null,
        assignee_id: resolvedAssignee,
        created_by: request.user.id,
        state: initialState,
        recurrence_rule: normalizedRule,
        recurrence_mode: recurrence_mode ?? null,
        completion_window_days: windowDays,
        due_at: dueAt,
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

    if ("due_at" in body.data) {
      const now = getNow();
      if (body.data.due_at === null) {
        updates.due_at = null;
        if (task.state !== "done") {
          const recomputed = computeTaskState({ ...task, due_at: null }, now);
          updates.state =
            recomputed === "archived" || recomputed === "done" ? task.state : recomputed;
        }
      } else if (body.data.due_at) {
        updates.due_at = new Date(body.data.due_at);
        if (task.state !== "done") {
          const recomputed = computeTaskState({ ...task, due_at: updates.due_at }, now);
          updates.state =
            recomputed === "archived" || recomputed === "done" ? task.state : recomputed;
        }
      }
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
        updates.due_at = null;
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
          { recurrence_rule: newRule, recurrence_mode: newMode, due_at: null },
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
            due_at: nextDueAt,
            completion_window_days: windowDays,
          },
          now,
        );

        updates.recurrence_rule = normalizedRule;
        updates.recurrence_mode = newMode;
        updates.completion_window_days = windowDays;
        updates.due_at = nextDueAt;
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

    const assigneeNamesUpdated = buildAssigneeNameMap(
      db,
      updated.assignee_id ? [updated.assignee_id] : [],
    );
    return reply.code(200).send(
      taskToResponse(updated, getNow(), {
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
    const currentState = computeTaskState(task, now);
    if (currentState === "not_yet") {
      return reply.code(409).send({ error: "Task is not yet due — reschedule it first" });
    }
    const wasOnTime = isOnTime(task, now);
    const isRecurring = task.recurrence_rule !== null && task.recurrence_mode !== null;
    const pointsAwarded = awardPoints(task);
    const cycleDueAt = task.due_at;

    // Reserve the cycle with a conditional update. Guards against two concurrent
    // completes both passing the state read above and double-cycling the task.
    // For one-off: claim by flipping state to "done" only if not already done.
    // For recurring: claim by replacing due_at only if it still matches
    // the value we read (a parallel completer would have already advanced it).
    const reserved = isRecurring
      ? (() => {
          const nextDueAt = computeNextDueAt(task, now, now);
          const nextStateInput = {
            archived_at: null,
            state: "not_yet" as const,
            recurrence_rule: task.recurrence_rule,
            due_at: nextDueAt,
            completion_window_days: task.completion_window_days,
          };
          const computed = computeTaskState(nextStateInput, now);
          const nextState =
            computed === "archived" || computed === "done" ? ("not_yet" as const) : computed;

          const result = db
            .update(schema.tasks)
            .set({ due_at: nextDueAt, state: nextState })
            .where(
              and(
                eq(schema.tasks.id, task.id),
                cycleDueAt === null
                  ? isNull(schema.tasks.due_at)
                  : eq(schema.tasks.due_at, cycleDueAt),
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
    db.update(schema.tasks).set({ archived_at: now }).where(eq(schema.tasks.id, task.id)).run();

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

  // ── POST /api/tasks/:id/reschedule ──────────────────────────────────────────
  // Sets due_at to any date (earlier or later) or clears it (moves task to Someday).
  // Works for all non-archived tasks regardless of recurrence.

  fastify.post("/api/tasks/:id/reschedule", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const body = RescheduleTaskBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const now = getNow();
    const newDueAt = body.data.due_at !== null ? new Date(body.data.due_at) : null;

    const newState = computeTaskState({ ...task, due_at: newDueAt }, now);
    const state = newState === "archived" || newState === "done" ? ("eligible" as const) : newState;

    db.update(schema.tasks)
      .set({ due_at: newDueAt, state })
      .where(eq(schema.tasks.id, task.id))
      .run();

    return reply.code(204).send();
  });
};

export default tasks;
