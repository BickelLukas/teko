import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { eq, isNull, and } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { getNow } from "../domain/clock.js";
import { generateIntegrationToken, hashIntegrationToken } from "../domain/integrationTokens.js";
import {
  CreateIntegrationTokenBodySchema,
  IntegrationTokenIdParamsSchema,
  type IntegrationToken,
} from "@teko/shared";
import "../types.js";

const integrationTokensPlugin: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/integration/tokens ─────────────────────────────────────────────
  // Active (non-revoked) tokens only. Never returns the raw token.

  fastify.get("/api/integration/tokens", async (): Promise<IntegrationToken[]> => {
    const rows = db
      .select()
      .from(schema.integrationTokens)
      .where(isNull(schema.integrationTokens.revoked_at))
      .all();

    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      created_at: r.created_at.toISOString(),
      last_used_at: r.last_used_at?.toISOString() ?? null,
    }));
  });

  // ── POST /api/integration/tokens ────────────────────────────────────────────
  // Returns the raw token once. It is never retrievable again — only its hash
  // is persisted.

  fastify.post("/api/integration/tokens", async (request, reply) => {
    const body = CreateIntegrationTokenBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const rawToken = generateIntegrationToken();
    const row = db
      .insert(schema.integrationTokens)
      .values({
        id: randomUUID(),
        token_hash: hashIntegrationToken(rawToken),
        label: body.data.label,
        created_by: request.user.id,
      })
      .returning()
      .get();

    return reply.code(201).send({
      id: row.id,
      label: row.label,
      created_at: row.created_at.toISOString(),
      last_used_at: null,
      token: rawToken,
    });
  });

  // ── DELETE /api/integration/tokens/:id ───────────────────────────────────────
  // Soft revoke — the row (and audit trail) is kept, just marked revoked.

  fastify.delete("/api/integration/tokens/:id", async (request, reply) => {
    const params = IntegrationTokenIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const token = db
      .select({ id: schema.integrationTokens.id })
      .from(schema.integrationTokens)
      .where(
        and(
          eq(schema.integrationTokens.id, params.data.id),
          isNull(schema.integrationTokens.revoked_at),
        ),
      )
      .get();
    if (!token) return reply.code(404).send({ error: "Token not found" });

    db.update(schema.integrationTokens)
      .set({ revoked_at: getNow() })
      .where(eq(schema.integrationTokens.id, params.data.id))
      .run();

    return reply.code(204).send();
  });
};

export default integrationTokensPlugin;
