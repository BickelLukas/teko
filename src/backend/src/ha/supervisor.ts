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

// ── Notify services ───────────────────────────────────────────────────────────

// GET /core/api/services returns one entry per domain. Each entry carries a map
// of service name → definition. We only care about the `notify` domain.
const ServiceDefinitionSchema = z.looseObject({
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const DomainServicesSchema = z.looseObject({
  domain: z.string(),
  services: z.record(z.string(), ServiceDefinitionSchema),
});

const ServicesResponseSchema = z.array(DomainServicesSchema);

export type NotifyService = {
  // Bare service name within the notify domain, e.g. "mobile_app_alices_phone".
  service_name: string;
  description: string | null;
};

const ConfigResponseSchema = z.looseObject({
  time_zone: z.string().optional().nullable(),
});

export type SendNotificationPayload = {
  title: string;
  message: string;
};

export type SendNotificationResult =
  | { ok: true }
  | { ok: false; status: number | null; body: string };

const NOTIFY_CACHE_TTL_MS = 5 * 60 * 1000;

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
  // Notify services in the HA `notify` domain. Cached for 5 minutes; pass
  // refresh=true to bypass the cache. An empty list is a valid result — some
  // HA installs have no notify integration configured.
  listNotifyServices(refresh?: boolean): Promise<NotifyService[]>;
  sendNotification(
    serviceName: string,
    payload: SendNotificationPayload,
  ): Promise<SendNotificationResult>;
  // Household timezone (IANA) from HA core config. Cached for the container's
  // lifetime; restart to pick up a changed HA timezone.
  getTimeZone(): Promise<string>;
};

export function createSupervisorClient(token: string): SupervisorClient {
  const baseUrl = "http://supervisor";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let notifyCache: { at: number; data: NotifyService[] } | null = null;
  let timeZoneCache: string | null = null;

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

    async listNotifyServices(refresh = false): Promise<NotifyService[]> {
      if (!refresh && notifyCache && Date.now() - notifyCache.at < NOTIFY_CACHE_TTL_MS) {
        return notifyCache.data;
      }

      const domains = await request(ServicesResponseSchema, "/core/api/services");
      const notifyDomain = domains.find((d) => d.domain === "notify");

      const services: NotifyService[] = notifyDomain
        ? Object.entries(notifyDomain.services).map(([service_name, def]) => ({
            service_name,
            description: def.description ?? def.name ?? null,
          }))
        : [];

      services.sort((a, b) => a.service_name.localeCompare(b.service_name));
      notifyCache = { at: Date.now(), data: services };
      return services;
    },

    async sendNotification(
      serviceName: string,
      payload: SendNotificationPayload,
    ): Promise<SendNotificationResult> {
      const path = `/core/api/services/notify/${serviceName}`;
      let res: Response;
      try {
        res = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: payload.title, message: payload.message }),
        });
      } catch (err) {
        return {
          ok: false,
          status: null,
          body: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, status: res.status, body };
      }
      return { ok: true };
    },

    async getTimeZone(): Promise<string> {
      if (timeZoneCache) return timeZoneCache;
      const config = await request(ConfigResponseSchema, "/core/api/config");
      timeZoneCache = config.time_zone ?? "UTC";
      return timeZoneCache;
    },
  };
}
