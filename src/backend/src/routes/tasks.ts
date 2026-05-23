import type { FastifyPluginAsync } from "fastify";
import { eq, and, isNull, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import { RRule } from "rrule";
import * as schema from "../db/schema.js";
import {
  CreateTaskBodySchema,
  CompleteTaskParamsSchema,
  TaskIdParamsSchema,
  ScheduleTaskBodySchema,
  SnoozeTaskBodySchema,
} from "@teko/shared";
import {
  computeNextDueAt,
  computeTaskState,
  computeWindowEnd,
  isWithinCompletionWindow,
  suggestCompletionWindow,
} from "../domain/recurrence.js";
import "../types.js";

function normalizeRrule(ruleStr: string, dtstart: Date): string {
  const parsed = RRule.fromString(ruleStr);
  return new RRule({ ...parsed.origOptions, dtstart }).toString();
}

const tasks: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/tasks ────────────────────────────────────────────────────────

  fastify.get("/api/tasks", async (request) => {
    const rows = db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.assignee_id, request.user.id),
          isNull(schema.tasks.archived_at),
          ne(schema.tasks.state, "done"),
        ),
      )
      .all();

    const now = new Date();
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignee_id: t.assignee_id,
      parent_id: t.parent_id,
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
    }));
  });

  // ── POST /api/tasks ───────────────────────────────────────────────────────

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
    } = parsed.data;

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

    db.insert(schema.tasks)
      .values({
        id,
        title,
        description: description ?? null,
        assignee_id: assignee_id ?? request.user.id,
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

    return reply.code(201).send({
      id: task.id,
      title: task.title,
      description: task.description,
      assignee_id: task.assignee_id,
      parent_id: task.parent_id,
      state: task.state,
      created_at: task.created_at,
      created_by: task.created_by,
      points: task.points,
      tags: task.tags,
      recurrence_rule: task.recurrence_rule,
      recurrence_mode: task.recurrence_mode,
      completion_window_days: task.completion_window_days,
      next_due_at: task.next_due_at,
      planned_for: task.planned_for,
    });
  });

  // ── POST /api/tasks/:id/complete ──────────────────────────────────────────

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

    return reply.code(204).send();
  });

  // ── POST /api/tasks/:id/schedule ──────────────────────────────────────────

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

  // ── POST /api/tasks/:id/unschedule ────────────────────────────────────────

  fastify.post("/api/tasks/:id/unschedule", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.archived_at !== null) return reply.code(409).send({ error: "Task is archived" });

    const now = new Date();
    const newState = computeTaskState({ ...task, planned_for: null }, now);
    const state = newState === "archived" || newState === "done" ? task.state : newState;

    db.update(schema.tasks).set({ planned_for: null, state }).where(eq(schema.tasks.id, task.id)).run();

    return reply.code(204).send();
  });

  // ── POST /api/tasks/:id/snooze ────────────────────────────────────────────

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
