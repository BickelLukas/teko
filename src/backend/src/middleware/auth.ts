import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema";
import type { Config } from "../config";
import "../types";

export async function registerAuth(fastify: FastifyInstance, config: Config): Promise<void> {
  if (config.devMode) {
    fastify.addHook("onRequest", async (request) => {
      const db = fastify.db;

      db.insert(schema.users)
        .values({
          id: randomUUID(),
          ha_user_id: config.devUserId,
          name: config.devUserName,
          is_admin: true,
        })
        .onConflictDoNothing({ target: schema.users.ha_user_id })
        .run();

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.ha_user_id, config.devUserId))
        .get();

      if (!user) {
        throw new Error("Dev-mode user provisioning failed");
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
