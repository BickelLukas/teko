import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import * as schema from "../db/schema";
import type { Db } from "../db/client";
import { initClock, setOffsetMs, getOffsetMs } from "../domain/clock";

const MIGRATIONS = path.join(process.cwd(), "drizzle/migrations");

const DEV_CONFIG = {
  port: 3001,
  nodeEnv: "test",
  devMode: true,
  devUserId: "test-user",
  devUserName: "Test User",
  dbPath: ":memory:",
  publicDir: null,
  supervisorToken: null,
  userSyncIntervalMinutes: 30,
};

const PROD_CONFIG = { ...DEV_CONFIG, devMode: false };

function buildTestDb(): { db: Db; userId: string } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS });

  const userId = randomUUID();
  db.insert(schema.users)
    .values({ id: userId, ha_user_id: "test-user", name: "Test User", is_admin: false })
    .run();

  return { db, userId };
}

describe("clock module defaults", () => {
  afterEach(() => {
    initClock({ devMode: true, initialOffsetMs: 0 });
  });

  it("offsetMs is 0 by default", () => {
    expect(getOffsetMs()).toBe(0);
  });

  it("POST /api/_dev/clock returns 401 in prod (route not registered)", async () => {
    const { db } = buildTestDb();
    const prodApp = await buildApp(db, PROD_CONFIG);
    try {
      const res = await prodApp.inject({
        method: "POST",
        url: "/api/_dev/clock",
        payload: { action: "reset" },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await prodApp.close();
    }
  });
});

describe("POST /api/_dev/clock", () => {
  let app: FastifyInstance;
  let db: Db;
  let userId: string;

  beforeEach(async () => {
    ({ db, userId } = buildTestDb());
    app = await buildApp(db, DEV_CONFIG);
  });

  afterEach(async () => {
    await app.close();
    initClock({ devMode: true, initialOffsetMs: 0 });
  });

  it("advance: response body and header reflect new offset", async () => {
    const advanceMs = 3 * 3_600_000; // +3h

    const post = await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "advance", ms: advanceMs },
    });
    expect(post.statusCode).toBe(200);
    const postBody = post.json() as { offsetMs: number };
    expect(postBody.offsetMs).toBe(advanceMs);
    expect(post.headers["x-teko-clock-offset"]).toBe(String(advanceMs));
    expect(getOffsetMs()).toBe(advanceMs);
  });

  it("set: jumps to target datetime", async () => {
    const target = new Date(Date.now() + 86_400_000 * 7).toISOString(); // +1 week

    const res = await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "set", target },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { offsetMs: number; virtualNow: string };
    expect(body.offsetMs).toBeGreaterThan(0);
    // virtualNow should be within 5s of target
    expect(Math.abs(new Date(body.virtualNow).getTime() - new Date(target).getTime())).toBeLessThan(
      5_000,
    );
  });

  it("reset: returns offset to 0", async () => {
    // Advance first
    await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "advance", ms: 3_600_000 },
    });

    const reset = await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "reset" },
    });
    expect(reset.statusCode).toBe(200);
    const body = reset.json() as { offsetMs: number };
    expect(body.offsetMs).toBe(0);
  });

  it("persists offset in dev_settings table", async () => {
    const advanceMs = 86_400_000;
    await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "advance", ms: advanceMs },
    });

    const row = db
      .select()
      .from(schema.devSettings)
      .where(eq(schema.devSettings.key, "clock_offset_ms"))
      .get();
    expect(row).toBeDefined();
    expect(parseInt(row!.value, 10)).toBe(advanceMs);
  });

  it("advance past a task's due date transitions it to eligible via tick", async () => {
    const futureMs = 2 * 3_600_000; // 2h from now
    const taskId = randomUUID();
    const nextDueAt = new Date(Date.now() + futureMs);

    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Future task",
        assignee_id: userId,
        created_by: userId,
        state: "not_yet",
        recurrence_rule: "RRULE:FREQ=DAILY",
        recurrence_mode: "fixed",
        completion_window_days: 1,
        next_due_at: nextDueAt,
      })
      .run();

    const res = await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "advance", ms: futureMs + 60_000 }, // push past due
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ticked: number };
    expect(body.ticked).toBeGreaterThanOrEqual(1);

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.state).toBe("eligible");
  });

  it("returns 400 for invalid action body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "invalid" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("response includes X-Teko-Clock-Offset header", async () => {
    const advanceMs = 3_600_000;
    const res = await app.inject({
      method: "POST",
      url: "/api/_dev/clock",
      payload: { action: "advance", ms: advanceMs },
    });
    expect(res.headers["x-teko-clock-offset"]).toBe(String(advanceMs));
  });

  it("boot: loads persisted offset from dev_settings", async () => {
    const savedMs = 7 * 86_400_000;
    db.insert(schema.devSettings)
      .values({ key: "clock_offset_ms", value: String(savedMs), updated_at: new Date() })
      .run();

    // Build a fresh app — simulates restart with saved offset
    const freshApp = await buildApp(db, DEV_CONFIG);
    try {
      expect(getOffsetMs()).toBe(savedMs);
    } finally {
      await freshApp.close();
      initClock({ devMode: true, initialOffsetMs: 0 });
    }
  });
});

// Ensure the clock module itself is guarded
describe("clock module", () => {
  it("setOffsetMs is a no-op when devMode is false", () => {
    initClock({ devMode: false, initialOffsetMs: 0 });
    setOffsetMs(99_999);
    expect(getOffsetMs()).toBe(0);
    initClock({ devMode: true, initialOffsetMs: 0 });
  });
});
