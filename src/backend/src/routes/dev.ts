import type { FastifyPluginAsync } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { runTick } from "../scheduler/tick.js";
import * as schema from "../db/schema.js";
import { SwitchUserBodySchema } from "@teko/shared";
import "../types.js";

const SEED_HA_IDS = ["dev-alice", "dev-bob", "dev-charlie"];

const dev: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  fastify.post("/api/_dev/tick", async (_request, reply) => {
    const updated = await runTick(db);
    return reply.code(200).send({ updated });
  });

  // Returns the list of seeded dev users for the switcher to populate
  fastify.get("/api/_dev/users", async (_request, reply) => {
    const users = db
      .select({
        id: schema.users.id,
        ha_user_id: schema.users.ha_user_id,
        name: schema.users.name,
        locale: schema.users.locale,
        is_admin: schema.users.is_admin,
      })
      .from(schema.users)
      .where(inArray(schema.users.ha_user_id, SEED_HA_IDS))
      .all();

    return reply.code(200).send(users);
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
};

export default dev;
