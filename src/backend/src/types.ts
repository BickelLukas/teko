import type { Db } from "./db/client";
import type { SupervisorClient } from "./ha/supervisor";

export type RequestUser = {
  id: string;
  ha_user_id: string;
  name: string;
  is_admin: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    user: RequestUser;
  }
  interface FastifyInstance {
    db: Db;
    supervisorClient: SupervisorClient | null;
  }
}
