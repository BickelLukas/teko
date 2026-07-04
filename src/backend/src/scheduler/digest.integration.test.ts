import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";
import { runDigestTick } from "./digest.js";
import type {
  SupervisorClient,
  NotifyService,
  SendNotificationPayload,
  SendNotificationResult,
} from "../ha/supervisor.js";

const MIGRATIONS = path.join(process.cwd(), "drizzle/migrations");

type Sent = { service: string; payload: SendNotificationPayload };

function fakeClient(opts: {
  timeZone?: string;
  result?: SendNotificationResult;
  sent: Sent[];
}): SupervisorClient {
  return {
    getUsers: async () => [],
    getInfo: async () => ({ version: "test", slug: "teko" }),
    listNotifyServices: async (): Promise<NotifyService[]> => [],
    getTimeZone: async () => opts.timeZone ?? "UTC",
    getIngressPath: async () => "/hassio/ingress/teko",
    pushDiscovery: async () => {},
    sendNotification: async (service, payload): Promise<SendNotificationResult> => {
      opts.sent.push({ service, payload });
      return opts.result ?? { ok: true };
    },
  };
}

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

function addUser(db: Db, overrides: Partial<typeof schema.users.$inferInsert> = {}): string {
  const id = randomUUID();
  db.insert(schema.users)
    .values({
      id,
      ha_user_id: id,
      name: "Alice",
      notify_digest_enabled: true,
      notification_service: "notify.mobile_app_alice",
      notification_time: "08:00",
      ...overrides,
    })
    .run();
  return id;
}

function addDueTask(db: Db, userId: string, title: string, dueAt: string): void {
  db.insert(schema.tasks)
    .values({
      id: randomUUID(),
      title,
      assignee_id: userId,
      created_by: userId,
      state: "eligible",
      due_at: dueAt,
      completion_window_days: 0,
    })
    .run();
}

// 2026-05-29 08:00 UTC.
const NOW = new Date("2026-05-29T08:00:00Z");
const TODAY = "2026-05-29";

describe("runDigestTick", () => {
  let db: Db;
  let sent: Sent[];

  beforeEach(() => {
    db = makeDb();
    sent = [];
  });

  it("is a no-op without a supervisor client (dev mode guard)", async () => {
    addUser(db);
    await runDigestTick(db, null, NOW);
    expect(sent).toEqual([]);
  });

  it("sends a digest to an eligible user at their time and records the date", async () => {
    const userId = addUser(db);
    addDueTask(db, userId, "take out trash", "2026-05-29");

    await runDigestTick(db, fakeClient({ sent }), NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.service).toBe("mobile_app_alice");
    expect(sent[0]!.payload.title).toBe("1 thing today");
    expect(sent[0]!.payload.message).toContain("take out trash");
    expect(sent[0]!.payload.clickAction).toBe("/hassio/ingress/teko");

    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_digest_sent_date).toBe(TODAY);
  });

  it("does not send twice the same day (restart idempotency)", async () => {
    const userId = addUser(db);
    addDueTask(db, userId, "take out trash", "2026-05-29");

    await runDigestTick(db, fakeClient({ sent }), NOW);
    // Simulate a restart at 08:00:30 — same minute, same day.
    await runDigestTick(db, fakeClient({ sent }), new Date("2026-05-29T08:00:30Z"));

    expect(sent).toHaveLength(1);
  });

  it("marks the date but sends nothing when there is no content", async () => {
    const userId = addUser(db); // user has no tasks
    await runDigestTick(db, fakeClient({ sent }), NOW);

    expect(sent).toEqual([]);
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_digest_sent_date).toBe(TODAY);
  });

  it("skips users whose time does not match the current minute", async () => {
    const userId = addUser(db, { notification_time: "09:00" });
    addDueTask(db, userId, "take out trash", "2026-05-29");

    await runDigestTick(db, fakeClient({ sent }), NOW);

    expect(sent).toEqual([]);
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_digest_sent_date).toBeNull();
  });

  it("leaves the date unset on send failure so it retries tomorrow", async () => {
    const userId = addUser(db);
    addDueTask(db, userId, "take out trash", "2026-05-29");

    await runDigestTick(
      db,
      fakeClient({ sent, result: { ok: false, status: 502, body: "boom" } }),
      NOW,
    );

    expect(sent).toHaveLength(1);
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_digest_sent_date).toBeNull();
  });

  it("skips users with notifications disabled or no target", async () => {
    const a = addUser(db, { notify_digest_enabled: false });
    const b = addUser(db, { notification_service: null });
    addDueTask(db, a, "task a", "2026-05-29");
    addDueTask(db, b, "task b", "2026-05-29");

    await runDigestTick(db, fakeClient({ sent }), NOW);

    expect(sent).toEqual([]);
  });
});
