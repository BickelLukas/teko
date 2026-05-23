import type { FastifyPluginAsync } from "fastify";
import { runTick } from "../scheduler/tick.js";
import "../types.js";

const dev: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/_dev/tick", async (_request, reply) => {
    const updated = await runTick(fastify.db);
    return reply.code(200).send({ updated });
  });
};

export default dev;
