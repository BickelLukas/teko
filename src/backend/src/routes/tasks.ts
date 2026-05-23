import type { FastifyPluginAsync } from "fastify";
import { eq, and, isNull, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema";
import { CreateTaskBodySchema, CompleteTaskParamsSchema } from "@teko/shared";
import "../types";

const tasks: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

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

    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignee_id: t.assignee_id,
      parent_id: t.parent_id,
      state: t.state,
      created_at: t.created_at,
      created_by: t.created_by,
      points: t.points,
      tags: t.tags,
    }));
  });

  fastify.post("/api/tasks", async (request, reply) => {
    const parsed = CreateTaskBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { title, description, assignee_id } = parsed.data;
    const id = randomUUID();

    db.insert(schema.tasks)
      .values({
        id,
        title,
        description: description ?? null,
        assignee_id: assignee_id ?? request.user.id,
        created_by: request.user.id,
        state: "eligible",
      })
      .run();

    let task;
    try {
      task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    } catch {
      return reply.code(500).send({ error: "Database error" });
    }
    if (!task) {
      return reply.code(500).send({ error: "Failed to retrieve created task" });
    }

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
    });
  });

  fastify.post("/api/tasks/:id/complete", async (request, reply) => {
    const parsed = CompleteTaskParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, parsed.data.id)).get();

    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    if (task.state === "done") {
      return reply.code(409).send({ error: "Task already completed" });
    }

    if (task.archived_at !== null) {
      return reply.code(409).send({ error: "Task is archived" });
    }

    db.transaction((tx) => {
      tx.update(schema.tasks).set({ state: "done" }).where(eq(schema.tasks.id, task.id)).run();
      tx.insert(schema.completions)
        .values({
          id: randomUUID(),
          task_id: task.id,
          completed_by: request.user.id,
          completed_at: new Date(),
        })
        .run();
    });

    return reply.code(204).send();
  });
};

export default tasks;
