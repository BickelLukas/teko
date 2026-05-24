import type { FastifyPluginAsync } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { getSyncState } from "../ha/sync-state.js";
import type { HealthResponse } from "@teko/shared";
import "../types.js";

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
  fastify.get("/api/health", async (): Promise<HealthResponse> => {
    const { supervisorReachable, lastUserSyncAt } = getSyncState();

    const activeUserCount = fastify.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.is_active, true))
      .all().length;

    return {
      status: "ok",
      version,
      uptime: Math.floor(process.uptime()),
      supervisor_reachable: supervisorReachable,
      last_user_sync_at: lastUserSyncAt ? lastUserSyncAt.toISOString() : null,
      active_user_count: activeUserCount,
    };
  });
};

export default health;
