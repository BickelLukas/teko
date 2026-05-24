import { z } from "zod";

const HaUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    is_owner: z.boolean(),
    is_admin: z.boolean(),
    system_generated: z.boolean().default(false),
  })
  .passthrough();

export type HaUser = {
  id: string;
  name: string;
  is_owner: boolean;
  is_admin: boolean;
};

const UserListResponseSchema = z.object({
  result: z.literal("ok"),
  data: z.object({
    users: z.array(HaUserSchema),
  }),
});

const AddOnInfoDataSchema = z
  .object({
    version: z.string(),
    hostname: z.string().optional(),
  })
  .passthrough();

const AddOnInfoResponseSchema = z.object({
  result: z.literal("ok"),
  data: AddOnInfoDataSchema,
});

export type AddOnInfo = {
  version: string;
  hostname?: string;
};

export class SupervisorApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly context?: string,
  ) {
    super(message);
    this.name = "SupervisorApiError";
  }
}

export type SupervisorClient = {
  getUsers(): Promise<HaUser[]>;
  getInfo(): Promise<AddOnInfo>;
};

export function createSupervisorClient(token: string): SupervisorClient {
  const baseUrl = "http://supervisor";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function request<T>(schema: z.ZodType<T>, path: string): Promise<T> {
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      throw new SupervisorApiError(
        `Network error calling Supervisor: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        path,
      );
    }
    if (!res.ok) {
      throw new SupervisorApiError(
        `Supervisor API returned ${res.status} for ${path}`,
        res.status,
        path,
      );
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new SupervisorApiError(
        `Invalid JSON from Supervisor for ${path}: ${err instanceof Error ? err.message : String(err)}`,
        res.status,
        path,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new SupervisorApiError(
        `Response validation failed for ${path}: ${parsed.error.message}`,
        undefined,
        path,
      );
    }
    return parsed.data;
  }

  return {
    async getUsers(): Promise<HaUser[]> {
      const resp = await request(UserListResponseSchema, "/auth/list_users");
      return resp.data.users
        .filter((u) => !u.system_generated)
        .map((u) => ({
          id: u.id,
          name: u.name ?? u.username ?? u.id,
          is_owner: u.is_owner,
          is_admin: u.is_admin,
        }));
    },

    async getInfo(): Promise<AddOnInfo> {
      const resp = await request(AddOnInfoResponseSchema, "/addons/self/info");
      const info: AddOnInfo = { version: resp.data.version };
      if (resp.data.hostname !== undefined) info.hostname = resp.data.hostname;
      return info;
    },
  };
}
