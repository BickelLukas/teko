import type { FastifyPluginAsync } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { HealthResponse } from "@teko/shared";

const pkgPath = path.join(__dirname, "../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/health",
    async (): Promise<HealthResponse> => ({
      status: "ok",
      version: pkg.version,
      uptime: Math.floor(process.uptime()),
    }),
  );
};

export default health;
