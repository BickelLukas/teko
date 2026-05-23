import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema.js";
import type { Config } from "../config.js";
import "../types.js";

export async function registerAuth(fastify: FastifyInstance, config: Config): Promise<void> {
  if (config.devMode) {
    fastify.addHook("onRequest", async (request, reply) => {
      const db = fastify.db;

      // Cookie takes precedence; falls back to DEV_USER_ID env var
      const cookieUserId =
        "cookies" in request &&
        typeof (request as { cookies?: Record<string, string> }).cookies === "object"
          ? (request as { cookies?: Record<string, string> }).cookies?.["dev_user_id"]
          : undefined;

      const targetHaId = cookieUserId ?? config.devUserId;

      // Auto-provision if missing
      db.insert(schema.users)
        .values({
          id: randomUUID(),
          ha_user_id: targetHaId,
          name: targetHaId,
          is_admin: targetHaId === config.devUserId,
        })
        .onConflictDoNothing({ target: schema.users.ha_user_id })
        .run();

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.ha_user_id, targetHaId))
        .get();

      if (!user) {
        await reply.code(401).send({ error: "Dev user not found: " + targetHaId });
        return;
      }

      request.user = {
        id: user.id,
        ha_user_id: user.ha_user_id,
        name: user.name,
        is_admin: user.is_admin,
      };
    });

    fastify.addHook("onSend", async (_request, reply, payload) => {
      reply.header("X-Teko-Dev-Mode", "true");
      return payload;
    });
  } else {
    // TODO Phase 2: ingress branch
    // TODO Phase 3: bearer token branch
    fastify.addHook("onRequest", async (_request, reply) => {
      await reply.code(401).send({ error: "Unauthorized" });
    });
  }
}
