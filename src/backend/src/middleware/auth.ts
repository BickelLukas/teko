import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { getOffsetMs } from "../domain/clock.js";
import { upsertHaUser } from "../ha/user-upsert.js";
import "../types.js";

// Only API paths require authentication. Static assets (JS/CSS/fonts) bypass
// auth so the SPA can load before any credentials are established.
function requiresAuth(request: FastifyRequest): boolean {
  return request.url.startsWith("/api/") || request.url.startsWith("/ws");
}

export async function registerAuth(fastify: FastifyInstance, config: Config): Promise<void> {
  if (config.devMode) {
    fastify.addHook("onRequest", async (request) => {
      if (!requiresAuth(request)) return;

      const db = fastify.db;

      // Cookie takes precedence; falls back to DEV_USER_ID env var
      const cookieUserId =
        "cookies" in request &&
        typeof (request as { cookies?: Record<string, string> }).cookies === "object"
          ? (request as { cookies?: Record<string, string> }).cookies?.["dev_user_id"]
          : undefined;

      const targetHaId = cookieUserId ?? config.devUserId;

      const { user } = upsertHaUser(db, targetHaId, targetHaId);

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
      const haUserDisplayName = request.headers["x-remote-user-display-name"];
      const haUserName = request.headers["x-remote-user-name"];

      if (ingressPath && typeof haUserId === "string" && haUserId) {
        const rawDisplay = typeof haUserDisplayName === "string" ? haUserDisplayName.trim() : "";
        const fallback = typeof haUserName === "string" ? haUserName : haUserId;
        const displayName = rawDisplay || fallback;

        const { user } = upsertHaUser(fastify.db, haUserId, displayName);

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
