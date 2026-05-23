import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@teko/shared";

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/health",
    async (): Promise<HealthResponse> => ({
      status: "ok",
      version: "0.0.1",
      uptime: Math.floor(process.uptime()),
    }),
  );
};

export default health;
