import type { FastifyPluginAsync } from "fastify";
import { eq, and, gte, lt } from "drizzle-orm";
import { startOfDay, addDays } from "date-fns";
import * as schema from "../db/schema.js";
import { UpdatePreferencesBodySchema } from "@teko/shared";
import "../types.js";

const me: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/me ───────────────────────────────────────────────────────────

  fastify.get("/api/me", async (request, reply) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();

    if (!user) return reply.code(404).send({ error: "User not found" });

    return reply.code(200).send({
      id: user.id,
      ha_user_id: user.ha_user_id,
      name: user.name,
      display_name: user.display_name,
      locale: user.locale,
      notification_time: user.notification_time,
      is_admin: user.is_admin,
      is_active: user.is_active,
      week_start_day: user.week_start_day,
    });
  });

  // ── PATCH /api/me/preferences ─────────────────────────────────────────────

  fastify.patch("/api/me/preferences", async (request, reply) => {
    const parsed = UpdatePreferencesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const updates: Partial<typeof schema.users.$inferInsert> = {};
    if (parsed.data.locale !== undefined) updates.locale = parsed.data.locale;
    if (parsed.data.notification_time !== undefined)
      updates.notification_time = parsed.data.notification_time;
    if (parsed.data.display_name !== undefined) updates.display_name = parsed.data.display_name;
    if (parsed.data.week_start_day !== undefined)
      updates.week_start_day = parsed.data.week_start_day;

    if (Object.keys(updates).length > 0) {
      db.update(schema.users).set(updates).where(eq(schema.users.id, request.user.id)).run();
    }

    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();

    if (!user) return reply.code(404).send({ error: "User not found" });

    return reply.code(200).send({
      id: user.id,
      ha_user_id: user.ha_user_id,
      name: user.name,
      display_name: user.display_name,
      locale: user.locale,
      notification_time: user.notification_time,
      is_admin: user.is_admin,
      is_active: user.is_active,
      week_start_day: user.week_start_day,
    });
  });

  // ── GET /api/me/today-stats ───────────────────────────────────────────────

  fastify.get("/api/me/today-stats", async (request, reply) => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = startOfDay(addDays(now, 1));

    const completions = db
      .select({ id: schema.completions.id })
      .from(schema.completions)
      .where(
        and(
          eq(schema.completions.completed_by, request.user.id),
          gte(schema.completions.completed_at, dayStart),
          lt(schema.completions.completed_at, dayEnd),
        ),
      )
      .all();

    return reply.code(200).send({ completions_today: completions.length });
  });
};

export default me;
