import type { FastifyPluginAsync } from "fastify";
import { eq, sql, and, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { getNow } from "../domain/clock.js";
import {
  TagIdParamsSchema,
  TaskIdParamsSchema,
  CreateTagBodySchema,
  UpdateTagBodySchema,
  SetTaskTagsBodySchema,
} from "@teko/shared";
import type { TagResponse } from "@teko/shared";
import "../types.js";

// ── Server-side tag list cache (30 s TTL) ────────────────────────────────────

type TagWithCountData = { id: number; name: string; color: TagResponse["color"]; count: number };
type CachedTags = { data: TagWithCountData[]; ts: number };
let _cache: CachedTags | null = null;
const CACHE_TTL_MS = 30_000;

function invalidateCache(): void {
  _cache = null;
}

function isCacheValid(): boolean {
  return _cache !== null && Date.now() - _cache.ts < CACHE_TTL_MS;
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const tagsPlugin: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/tags ───────────────────────────────────────────────────────────
  // Returns all tags with usage counts (non-archived tasks only), sorted by
  // count desc then name asc. Cached for 30 s.

  fastify.get("/api/tags", async () => {
    if (isCacheValid()) {
      return _cache!.data;
    }

    const rows = db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
        color: schema.tags.color,
        count: sql<number>`COUNT(CASE WHEN ${schema.task_tags.task_id} IS NOT NULL AND ${schema.tasks.archived_at} IS NULL THEN 1 END)`,
      })
      .from(schema.tags)
      .leftJoin(schema.task_tags, eq(schema.tags.id, schema.task_tags.tag_id))
      .leftJoin(schema.tasks, eq(schema.task_tags.task_id, schema.tasks.id))
      .groupBy(schema.tags.id)
      .orderBy(
        sql`COUNT(CASE WHEN ${schema.task_tags.task_id} IS NOT NULL AND ${schema.tasks.archived_at} IS NULL THEN 1 END) DESC`,
        schema.tags.name,
      )
      .all();

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color as TagResponse["color"],
      count: r.count,
    }));

    _cache = { data, ts: Date.now() };
    return data;
  });

  // ── POST /api/tags ──────────────────────────────────────────────────────────

  fastify.post("/api/tags", async (request, reply) => {
    const body = CreateTagBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { name, color } = body.data;

    // Case-insensitive duplicate check (mirrors the DB UNIQUE INDEX ON LOWER(name))
    const existing = db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(sql`LOWER(${schema.tags.name}) = LOWER(${name})`)
      .get();
    if (existing) return reply.code(409).send({ error: "A tag with this name already exists" });

    const result = db
      .insert(schema.tags)
      .values({ name, color, created_by: request.user.id })
      .returning({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .get();

    invalidateCache();
    return reply.code(201).send(result);
  });

  // ── PATCH /api/tags/:id ─────────────────────────────────────────────────────

  fastify.patch("/api/tags/:id", async (request, reply) => {
    const params = TagIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const body = UpdateTagBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const tag = db.select().from(schema.tags).where(eq(schema.tags.id, params.data.id)).get();
    if (!tag) return reply.code(404).send({ error: "Tag not found" });

    const updates: Partial<typeof schema.tags.$inferInsert> = {};
    if (body.data.color !== undefined) updates.color = body.data.color;

    if (body.data.name !== undefined) {
      const conflict = db
        .select({ id: schema.tags.id })
        .from(schema.tags)
        .where(
          and(
            sql`LOWER(${schema.tags.name}) = LOWER(${body.data.name})`,
            sql`${schema.tags.id} != ${params.data.id}`,
          ),
        )
        .get();
      if (conflict) return reply.code(409).send({ error: "A tag with this name already exists" });
      updates.name = body.data.name;
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(200).send({ id: tag.id, name: tag.name, color: tag.color });
    }

    const updated = db
      .update(schema.tags)
      .set(updates)
      .where(eq(schema.tags.id, params.data.id))
      .returning({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .get();

    invalidateCache();
    return reply.code(200).send(updated);
  });

  // ── DELETE /api/tags/:id ────────────────────────────────────────────────────
  // Transactional: removes task_tags rows then the tag itself.

  fastify.delete("/api/tags/:id", async (request, reply) => {
    const params = TagIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const tag = db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(eq(schema.tags.id, params.data.id))
      .get();
    if (!tag) return reply.code(404).send({ error: "Tag not found" });

    db.transaction((tx) => {
      tx.delete(schema.task_tags).where(eq(schema.task_tags.tag_id, params.data.id)).run();
      tx.delete(schema.tags).where(eq(schema.tags.id, params.data.id)).run();
    });

    invalidateCache();
    return reply.code(204).send();
  });

  // ── GET /api/tasks/:id/tags ─────────────────────────────────────────────────

  fastify.get("/api/tasks/:id/tags", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, params.data.id))
      .get();
    if (!task) return reply.code(404).send({ error: "Task not found" });

    const rows = db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .from(schema.task_tags)
      .innerJoin(schema.tags, eq(schema.task_tags.tag_id, schema.tags.id))
      .where(eq(schema.task_tags.task_id, params.data.id))
      .all();

    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
  });

  // ── POST /api/tasks/:id/tags ────────────────────────────────────────────────
  // Replaces the full tag set for a task (idempotent, AND-semantics on IDs).

  fastify.post("/api/tasks/:id/tags", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const body = SetTaskTagsBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const task = db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, params.data.id))
      .get();
    if (!task) return reply.code(404).send({ error: "Task not found" });

    const { tag_ids } = body.data;

    // Validate that all requested tag IDs exist
    if (tag_ids.length > 0) {
      const found = db
        .select({ id: schema.tags.id })
        .from(schema.tags)
        .where(inArray(schema.tags.id, tag_ids))
        .all();
      if (found.length !== tag_ids.length) {
        return reply.code(400).send({ error: "One or more tag IDs do not exist" });
      }
    }

    const now = getNow();

    db.transaction((tx) => {
      // Delete all existing assignments for this task
      tx.delete(schema.task_tags).where(eq(schema.task_tags.task_id, params.data.id)).run();

      // Re-insert the new set
      if (tag_ids.length > 0) {
        tx.insert(schema.task_tags)
          .values(tag_ids.map((tag_id) => ({ task_id: params.data.id, tag_id, created_at: now })))
          .run();
      }
    });

    invalidateCache();

    // Return the updated tag list
    const rows = db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .from(schema.task_tags)
      .innerJoin(schema.tags, eq(schema.task_tags.tag_id, schema.tags.id))
      .where(eq(schema.task_tags.task_id, params.data.id))
      .all();

    return reply.code(200).send(rows.map((r) => ({ id: r.id, name: r.name, color: r.color })));
  });
};

export default tagsPlugin;
