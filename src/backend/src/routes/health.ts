import type { FastifyPluginAsync } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { HealthResponse } from "@teko/shared";

// __dirname differs between dev (src/routes/) and prod bundle (dist/).
// Try both relative paths to find the backend package.json.
function loadVersion(): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const raw = readFileSync(path.join(__dirname, rel), "utf8");
      const parsed = JSON.parse(raw) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // try next candidate
    }
  }
  return "0.0.0";
}

const version = loadVersion();

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/health",
    async (): Promise<HealthResponse> => ({
      status: "ok",
      version,
      uptime: Math.floor(process.uptime()),
    }),
  );
};

export default health;
