import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { Db } from "./db/client.js";
import health from "./routes/health.js";
import tasks from "./routes/tasks.js";
import me from "./routes/me.js";
import dev from "./routes/dev.js";
import { registerAuth } from "./middleware/auth.js";
import type { Config } from "./config.js";
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

  await registerAuth(fastify, config);
  await fastify.register(health);
  await fastify.register(tasks);
  await fastify.register(me);

  if (config.devMode) {
    await fastify.register(dev);
  }

  return fastify;
}
