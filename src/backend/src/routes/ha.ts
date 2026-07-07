import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, isNull, ne } from "drizzle-orm";
import type { NotifyServicesResponse, HaSummaryResponse } from "@teko/shared";
import * as schema from "../db/schema.js";
import { getNow } from "../domain/clock.js";
import "../types.js";

const NotifyServicesQuerySchema = z.object({
  refresh: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const ha: FastifyPluginAsync = async (fastify) => {
  // ── GET /api/ha/notify-services ───────────────────────────────────────────
  // Proxies the HA Core notify-service list. An empty list is a valid result
  // (no notify integration installed). Without a Supervisor client (dev mode)
  // there is nothing to list, so we return an empty list rather than erroring.
  fastify.get(
    "/api/ha/notify-services",
    async (request, reply): Promise<NotifyServicesResponse> => {
      const parsed = NotifyServicesQuerySchema.safeParse(request.query);
      const refresh = parsed.success ? parsed.data.refresh : false;

      const client = fastify.supervisorClient;
      if (!client) return { services: [] };

      try {
        const services = await client.listNotifyServices(refresh);
        return { services };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.warn({ err: msg }, "ha.notify-services-failed");
        await reply.code(502).send({ error: `Supervisor API error: ${msg}` });
        return { services: [] };
      }
    },
  );

  // ── GET /api/ha/summary ────────────────────────────────────────────────────
  // Household-wide aggregate consumed by the HA integration. The three counts
  // mirror the frontend's Today page buckets exactly (see Today.tsx
  // bucketTasks): overdue, today (actionable now), eligible (early
  // completion-window, due later). `tasks` is the fuller open-task list
  // backing the `todo` entity. Not user-scoped — reachable via ingress
  // (dev/UI) or the integration's bearer token.
  fastify.get("/api/ha/summary", async (): Promise<HaSummaryResponse> => {
    const db = fastify.db;
    const today = getNow().toISOString().slice(0, 10);

    const openTasks = db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        due_at: schema.tasks.due_at,
        state: schema.tasks.state,
        recurrence_rule: schema.tasks.recurrence_rule,
      })
      .from(schema.tasks)
      .where(and(isNull(schema.tasks.archived_at), ne(schema.tasks.state, "done")))
      .all();

    const overdueCount = openTasks.filter((t) => t.state === "overdue").length;
    // "Today": eligible tasks that are actionable right now — no due date, or
    // a due date that has arrived. Someday tasks (no recurrence, no due_at)
    // compute to state "eligible" too but must not count here — they're a
    // separate opt-in list, excluded the same way scope=active excludes them
    // in /api/tasks.
    const todayCount = openTasks.filter(
      (t) =>
        t.state === "eligible" &&
        (t.recurrence_rule !== null || t.due_at !== null) &&
        (t.due_at === null || t.due_at <= today),
    ).length;
    // "Eligible": eligible tasks still in an early completion window (due
    // later), not yet urgent.
    const eligibleCount = openTasks.filter(
      (t) => t.state === "eligible" && t.due_at !== null && t.due_at > today,
    ).length;

    return {
      eligible_count: eligibleCount,
      today_count: todayCount,
      overdue_count: overdueCount,
      tasks: openTasks.map(({ id, title, due_at, state }) => ({ id, title, due_at, state })),
    };
  });
};

export default ha;
