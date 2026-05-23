import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { Db } from "./db/client.js";
import health from "./routes/health.js";
import tasks from "./routes/tasks.js";
import projects from "./routes/projects.js";
import me from "./routes/me.js";
import stats from "./routes/stats.js";
import dev from "./routes/dev.js";
import { eq } from "drizzle-orm";
import { registerAuth } from "./middleware/auth.js";
import type { Config } from "./config.js";
import { initClock } from "./domain/clock.js";
import * as schema from "./db/schema.js";
import "./types.js";

export async function buildApp(db: Db, config: Config): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: config.nodeEnv !== "test",
  });

  if (config.devMode) {
    fastify.log.warn(
      "************************************************************\n" +
        "  DEV MODE ACTIVE - Auth is DISABLED.\n" +
        `  Injecting mock user: ${config.devUserId} (${config.devUserName})\n` +
        "  Never run with DEV_MODE=true in production.\n" +
        "************************************************************",
    );
  }

  await fastify.register(fastifyCookie);

  fastify.decorate("db", db);

  {
    let initialOffsetMs = 0;
    if (config.devMode) {
      const stored = db
        .select({ value: schema.devSettings.value })
        .from(schema.devSettings)
        .where(eq(schema.devSettings.key, "clock_offset_ms"))
        .get();
      if (stored) {
        initialOffsetMs = parseInt(stored.value, 10) || 0;
      }
    }
    initClock({ devMode: config.devMode, initialOffsetMs });
  }

  await registerAuth(fastify, config);
  await fastify.register(health);
  await fastify.register(tasks);
  await fastify.register(projects);
  await fastify.register(me);
  await fastify.register(stats);

  if (config.devMode) {
    await fastify.register(dev);
  }

  return fastify;
}
