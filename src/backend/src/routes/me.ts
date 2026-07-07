import type { FastifyPluginAsync } from "fastify";
import { eq, and, gte, lt } from "drizzle-orm";
import { startOfDay, addDays } from "date-fns";
import { getNow } from "../domain/clock.js";
import * as schema from "../db/schema.js";
import { UpdatePreferencesBodySchema, bareNotifyServiceName } from "@teko/shared";
import type { UserResponse } from "@teko/shared";
import { translate } from "../i18n/index.js";
import "../types.js";

type UserRow = typeof schema.users.$inferSelect;

function toUserResponse(user: UserRow): UserResponse {
  return {
    id: user.id,
    ha_user_id: user.ha_user_id,
    name: user.name,
    display_name: user.display_name,
    locale: user.locale,
    theme: user.theme ?? "system",
    notification_time: user.notification_time,
    notification_service: user.notification_service,
    notify_digest_enabled: user.notify_digest_enabled,
    notify_evening_reminder_enabled: user.notify_evening_reminder_enabled,
    evening_reminder_time: user.evening_reminder_time,
    is_admin: user.is_admin,
    is_active: user.is_active,
    week_start_day: user.week_start_day as 0 | 1,
  };
}

// Test-notification rate limit: one send per 10 seconds per user.
const TEST_NOTIFICATION_INTERVAL_MS = 10_000;
const lastTestNotificationAt = new Map<string, number>();

const me: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/me ───────────────────────────────────────────────────────────

  fastify.get("/api/me", async (request, reply) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();

    if (!user) return reply.code(404).send({ error: "User not found" });

    return reply.code(200).send(toUserResponse(user));
  });

  // ── PATCH /api/me/preferences ─────────────────────────────────────────────

  fastify.patch("/api/me/preferences", async (request, reply) => {
    const parsed = UpdatePreferencesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const updates: Partial<typeof schema.users.$inferInsert> = {};
    if (parsed.data.locale !== undefined) updates.locale = parsed.data.locale;
    if (parsed.data.theme !== undefined) updates.theme = parsed.data.theme;
    if (parsed.data.notification_time !== undefined)
      updates.notification_time = parsed.data.notification_time;
    if (parsed.data.notification_service !== undefined)
      updates.notification_service = parsed.data.notification_service;
    if (parsed.data.notify_digest_enabled !== undefined)
      updates.notify_digest_enabled = parsed.data.notify_digest_enabled;
    if (parsed.data.notify_evening_reminder_enabled !== undefined)
      updates.notify_evening_reminder_enabled = parsed.data.notify_evening_reminder_enabled;
    if (parsed.data.evening_reminder_time !== undefined)
      updates.evening_reminder_time = parsed.data.evening_reminder_time;
    if (parsed.data.display_name !== undefined) updates.display_name = parsed.data.display_name;
    if (parsed.data.week_start_day !== undefined)
      updates.week_start_day = parsed.data.week_start_day;

    if (Object.keys(updates).length > 0) {
      db.update(schema.users).set(updates).where(eq(schema.users.id, request.user.id)).run();
    }

    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();

    if (!user) return reply.code(404).send({ error: "User not found" });

    return reply.code(200).send(toUserResponse(user));
  });

  // ── POST /api/me/test-notification ─────────────────────────────────────────
  // Sends a one-off test notification to the user's currently-saved notify
  // service. Surfaces the real HA error on failure so the user can debug.

  fastify.post("/api/me/test-notification", async (request, reply) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();
    if (!user) return reply.code(404).send({ error: "User not found" });

    if (!user.notification_service) {
      return reply.code(400).send({
        error: "no_target",
        message: "No notification target is configured.",
      });
    }

    // Rate limit: 1 per 10s per user.
    const now = Date.now();
    const last = lastTestNotificationAt.get(user.id) ?? 0;
    if (now - last < TEST_NOTIFICATION_INTERVAL_MS) {
      const retryAfter = Math.ceil((TEST_NOTIFICATION_INTERVAL_MS - (now - last)) / 1000);
      reply.header("Retry-After", String(retryAfter));
      return reply.code(429).send({
        error: "rate_limited",
        message: "Please wait a moment before sending another test.",
      });
    }

    const client = fastify.supervisorClient;
    if (!client) {
      return reply.code(503).send({
        error: "supervisor_unavailable",
        message: "Home Assistant is not reachable in this mode.",
      });
    }

    lastTestNotificationAt.set(user.id, now);

    let clickAction: string | undefined;
    try {
      clickAction = await client.getIngressPath();
    } catch (err) {
      request.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "me.test-notification.ingress-path-unavailable",
      );
    }

    const serviceName = bareNotifyServiceName(user.notification_service);
    const result = await client.sendNotification(serviceName, {
      title: translate(user.locale, "notifications.test.title"),
      message: translate(user.locale, "notifications.test.message"),
      ...(clickAction !== undefined ? { clickAction } : {}),
    });

    if (result.ok) {
      return reply.code(200).send({ sent_to: user.notification_service });
    }

    // A 404 means the service no longer exists in HA (e.g. the mobile_app
    // device was removed). Clear the broken target so the UI reflects reality.
    if (result.status === 404) {
      db.update(schema.users)
        .set({ notification_service: null })
        .where(eq(schema.users.id, user.id))
        .run();
      return reply.code(502).send({
        error: "service_not_found",
        message: "Service not found in HA.",
        ha_status: result.status,
        ha_body: result.body,
      });
    }

    return reply.code(502).send({
      error: "ha_error",
      message: `HA returned an error: ${result.status ?? "network error"}`,
      ha_status: result.status,
      ha_body: result.body,
    });
  });

  // ── GET /api/me/today-stats ───────────────────────────────────────────────

  fastify.get("/api/me/today-stats", async (request, reply) => {
    const now = getNow();
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
