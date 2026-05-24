import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { runTick } from "../scheduler/tick.js";
import * as schema from "../db/schema.js";
import { SwitchUserBodySchema, ClockActionSchema } from "@teko/shared";
import { getNow, getOffsetMs, setOffsetMs } from "../domain/clock.js";
import "../types.js";


const dev: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  fastify.post("/api/_dev/tick", async (_request, reply) => {
    const updated = await runTick(db);
    return reply.code(200).send({ updated });
  });

  // Sets a dev_user_id cookie to switch the active dev user
  fastify.post("/api/_dev/switch-user", async (request, reply) => {
    const parsed = SwitchUserBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { ha_user_id } = parsed.data;

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.ha_user_id, ha_user_id))
      .get();

    if (!user) {
      return reply.code(404).send({ error: `User ${ha_user_id} not found` });
    }

    void reply.setCookie("dev_user_id", ha_user_id, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    });

    return reply.code(200).send({
      id: user.id,
      ha_user_id: user.ha_user_id,
      name: user.name,
      locale: user.locale,
      is_admin: user.is_admin,
    });
  });

  fastify.post("/api/_dev/clock", async (request, reply) => {
    const parsed = ClockActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const action = parsed.data;
    let newOffsetMs: number;

    if (action.action === "advance") {
      newOffsetMs = getOffsetMs() + action.ms;
    } else if (action.action === "set") {
      newOffsetMs = new Date(action.target).getTime() - Date.now();
    } else {
      newOffsetMs = 0;
    }

    setOffsetMs(newOffsetMs);

    db.insert(schema.devSettings)
      .values({ key: "clock_offset_ms", value: String(newOffsetMs), updated_at: new Date() })
      .onConflictDoUpdate({
        target: schema.devSettings.key,
        set: { value: String(newOffsetMs), updated_at: new Date() },
      })
      .run();

    const ticked = await runTick(db, getNow());

    return reply.code(200).send({
      offsetMs: newOffsetMs,
      virtualNow: getNow().toISOString(),
      realNow: new Date().toISOString(),
      ticked,
    });
  });
};

export default dev;
