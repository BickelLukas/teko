import { z } from "zod";

// Person entities from HA Core REST /core/api/states.
// Only persons with a linked user_id can authenticate via ingress.
const PersonAttributesSchema = z.looseObject({
  user_id: z.string().optional().nullable(),
  friendly_name: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
});

const PersonStateSchema = z.looseObject({
  entity_id: z.string(),
  attributes: PersonAttributesSchema,
});

const StatesResponseSchema = z.array(PersonStateSchema);

export type HaUser = {
  id: string;
  name: string;
};

const AddOnInfoDataSchema = z.looseObject({
  version: z.string(),
  hostname: z.string().optional(),
});

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

  type PersonWithUserId = z.infer<typeof PersonStateSchema> & {
    attributes: { user_id: string };
  };

  function hasUserId(s: z.infer<typeof PersonStateSchema>): s is PersonWithUserId {
    return (
      s.entity_id.startsWith("person.") &&
      typeof s.attributes.user_id === "string" &&
      s.attributes.user_id.length > 0
    );
  }

  return {
    async getUsers(): Promise<HaUser[]> {
      const states = await request(StatesResponseSchema, "/core/api/states");
      return states.filter(hasUserId).map((s) => ({
        id: s.attributes.user_id,
        name: s.attributes.friendly_name ?? s.attributes.name ?? s.entity_id,
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
