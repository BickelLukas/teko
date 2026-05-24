import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema.js";
import type { Config } from "../config.js";
import { getOffsetMs } from "../domain/clock.js";
import "../types.js";

// Only API paths require authentication. Static assets (JS/CSS/fonts) bypass
// auth so the SPA can load before any credentials are established.
function requiresAuth(request: FastifyRequest): boolean {
  return request.url.startsWith("/api/") || request.url.startsWith("/ws");
}

export async function registerAuth(fastify: FastifyInstance, config: Config): Promise<void> {
  if (config.devMode) {
    fastify.addHook("onRequest", async (request, reply) => {
      if (!requiresAuth(request)) return;

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
      reply.header("X-Teko-Clock-Offset", String(getOffsetMs()));
      return payload;
    });
  } else {
    fastify.addHook("onRequest", async (request, reply) => {
      if (!requiresAuth(request)) return;

      // ── Branch 1: HA ingress ─────────────────────────────────────────────
      // Trust X-Remote-User-Id/Name only when X-Ingress-Path is also present.
      // The ingress path header is set exclusively by HA's ingress proxy and
      // is not reachable by external clients, so its presence confirms the
      // request came through ingress.
      const ingressPath = request.headers["x-ingress-path"];
      const haUserId = request.headers["x-remote-user-id"];
      const haUserName = request.headers["x-remote-user-name"];

      if (ingressPath && typeof haUserId === "string" && haUserId) {
        const db = fastify.db;
        const displayName = typeof haUserName === "string" ? haUserName : haUserId;

        // Auto-provision on first contact
        db.insert(schema.users)
          .values({
            id: randomUUID(),
            ha_user_id: haUserId,
            name: displayName,
            is_admin: false,
          })
          .onConflictDoNothing({ target: schema.users.ha_user_id })
          .run();

        const user = db
          .select()
          .from(schema.users)
          .where(eq(schema.users.ha_user_id, haUserId))
          .get();

        if (!user) {
          await reply.code(500).send({ error: "Failed to provision user" });
          return;
        }

        // Sync display name if it changed in HA
        if (user.name !== displayName) {
          db.update(schema.users)
            .set({ name: displayName })
            .where(eq(schema.users.id, user.id))
            .run();
          user.name = displayName;
        }

        request.user = {
          id: user.id,
          ha_user_id: user.ha_user_id,
          name: user.name,
          is_admin: user.is_admin,
        };
        return;
      }

      // ── Branch 2: bearer token (Phase 11) ───────────────────────────────
      // Placeholder — bearer pairing endpoints are added in Phase 11.

      // ── Branch 3: OAuth2 (future) ────────────────────────────────────────

      await reply.code(401).send({ error: "Unauthorized" });
    });
  }
}
