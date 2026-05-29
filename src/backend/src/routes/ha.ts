import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { NotifyServicesResponse } from "@teko/shared";
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
};

export default ha;
