import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import type { Db } from "./db/client.js";
import health from "./routes/health.js";
import tasks from "./routes/tasks.js";
import projects from "./routes/projects.js";
import me from "./routes/me.js";
import stats from "./routes/stats.js";
import users from "./routes/users.js";
import ha from "./routes/ha.js";
import dev from "./routes/dev.js";
import { eq } from "drizzle-orm";
import { registerAuth } from "./middleware/auth.js";
import type { Config } from "./config.js";
import type { SupervisorClient } from "./ha/supervisor.js";
import { initClock } from "./domain/clock.js";
import * as schema from "./db/schema.js";
import "./types.js";

export async function buildApp(
  db: Db,
  config: Config,
  supervisorClient: SupervisorClient | null = null,
): Promise<FastifyInstance> {
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
  fastify.decorate("supervisorClient", supervisorClient);

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

  // In production, serve the bundled SPA. Must be registered before auth so
  // static asset requests (JS/CSS/fonts) bypass the auth hook — only /api/*
  // requests need authentication.
  if (config.publicDir) {
    const publicDir = path.resolve(config.publicDir);
    const indexPath = path.join(publicDir, "index.html");

    let cachedIndex: Buffer;
    try {
      cachedIndex = await fs.promises.readFile(indexPath);
    } catch (err) {
      fastify.log.error({ err, indexPath }, "Failed to read index.html — aborting startup");
      process.exit(1);
    }

    await fastify.register(fastifyStatic, {
      root: publicDir,
      wildcard: false,
    });

    // SPA fallback: any non-API path that doesn't match a file returns index.html
    // so client-side routing works on hard reload.
    fastify.setNotFoundHandler((_request, reply) => {
      if (_request.url.startsWith("/api/") || _request.url.startsWith("/ws")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.type("text/html").send(cachedIndex);
    });
  }

  await registerAuth(fastify, config);
  await fastify.register(health);
  await fastify.register(tasks);
  await fastify.register(projects);
  await fastify.register(me);
  await fastify.register(stats);
  await fastify.register(users);
  await fastify.register(ha);

  if (config.devMode) {
    await fastify.register(dev);
  }

  return fastify;
}
