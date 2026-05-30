import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { syncUsers } from "../ha/user-sync.js";
import { updateSyncState } from "../ha/sync-state.js";
import type { SyncResult, UserResponse } from "@teko/shared";
import "../types.js";

const MIN_SYNC_INTERVAL_MS = 30_000;
let lastSyncRequestAt = 0;

const users: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/users", async (): Promise<UserResponse[]> => {
    const rows = fastify.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.is_active, true))
      .all();

    return rows.map((u) => ({
      id: u.id,
      ha_user_id: u.ha_user_id,
      name: u.name,
      display_name: u.display_name,
      locale: u.locale,
      theme: u.theme,
      notification_time: u.notification_time,
      notification_service: u.notification_service,
      notify_digest_enabled: u.notify_digest_enabled,
      notify_evening_reminder_enabled: u.notify_evening_reminder_enabled,
      evening_reminder_time: u.evening_reminder_time,
      is_admin: u.is_admin,
      is_active: u.is_active,
      week_start_day: u.week_start_day as 0 | 1,
    }));
  });

  fastify.post("/api/users/sync", async (request, reply): Promise<SyncResult | void> => {
    const client = fastify.supervisorClient;

    if (!client) {
      await reply.code(503).send({ error: "Supervisor API not available in this mode" });
      return;
    }

    const now = Date.now();
    if (now - lastSyncRequestAt < MIN_SYNC_INTERVAL_MS) {
      const retryAfter = Math.ceil((MIN_SYNC_INTERVAL_MS - (now - lastSyncRequestAt)) / 1000);
      reply.header("Retry-After", String(retryAfter));
      await reply.code(429).send({ error: "Rate limited: minimum 30 seconds between syncs" });
      return;
    }
    lastSyncRequestAt = now;

    let haUsers;
    try {
      haUsers = await client.getUsers();
      updateSyncState(true, null);
    } catch (err) {
      updateSyncState(false, null);
      const msg = err instanceof Error ? err.message : String(err);
      request.log.warn({ err: msg }, "users.sync supervisor-api-error");
      await reply.code(502).send({ error: `Supervisor API error: ${msg}` });
      return;
    }

    const counts = syncUsers(haUsers, fastify.db);
    const synced_at = new Date().toISOString();
    updateSyncState(true, new Date(synced_at));

    return { ...counts, synced_at };
  });
};

export default users;
