import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { randomUUID } from "crypto";
import path from "path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import * as schema from "../db/schema";
import type { Db } from "../db/client";
import type { HaSummaryResponse } from "@teko/shared";

const MIGRATIONS = path.join(process.cwd(), "drizzle/migrations");

const TEST_CONFIG = {
  port: 3002,
  nodeEnv: "test",
  devMode: true,
  devUserId: "test-user",
  devUserName: "Test User",
  dbPath: ":memory:",
  publicDir: null,
  supervisorToken: null,
  userSyncIntervalMinutes: 30,
};

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

function insertTask(
  db: Db,
  userId: string,
  title: string,
  overrides: Partial<typeof schema.tasks.$inferInsert> = {},
): void {
  db.insert(schema.tasks)
    .values({
      id: randomUUID(),
      title,
      assignee_id: userId,
      created_by: userId,
      state: "eligible",
      ...overrides,
    })
    .run();
}

// These three counts mirror the frontend's Today page buckets exactly
// (see Today.tsx bucketTasks): overdue, today, eligible.
describe("GET /api/ha/summary", () => {
  let app: FastifyInstance;
  let db: Db;
  let userId: string;

  beforeEach(async () => {
    ({ db, userId } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("counts an overdue task", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    insertTask(db, userId, "Overdue task", { due_at: yesterday, state: "overdue" });

    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    const body = res.json<HaSummaryResponse>();

    expect(body.overdue_count).toBe(1);
    expect(body.today_count).toBe(0);
    expect(body.eligible_count).toBe(0);
  });

  it("counts an eligible task due today as today, not overdue or eligible", async () => {
    const today = new Date().toISOString().slice(0, 10);
    insertTask(db, userId, "Due today", { due_at: today, state: "eligible" });

    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    const body = res.json<HaSummaryResponse>();

    expect(body.today_count).toBe(1);
    expect(body.overdue_count).toBe(0);
    expect(body.eligible_count).toBe(0);
  });

  it("counts an eligible task with no due date as today", async () => {
    insertTask(db, userId, "Someday-eligible", { due_at: null, state: "eligible" });

    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    const body = res.json<HaSummaryResponse>();

    expect(body.today_count).toBe(1);
    expect(body.eligible_count).toBe(0);
  });

  it("counts an eligible task due later (early completion window) as eligible", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    insertTask(db, userId, "Early window", {
      due_at: tomorrow,
      state: "eligible",
      completion_window_days: 3,
    });

    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    const body = res.json<HaSummaryResponse>();

    expect(body.eligible_count).toBe(1);
    expect(body.today_count).toBe(0);
    expect(body.overdue_count).toBe(0);
  });

  it("does not count a not_yet task in any of the three buckets", async () => {
    const inFiveDays = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    insertTask(db, userId, "Not yet", { due_at: inFiveDays, state: "not_yet" });

    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    const body = res.json<HaSummaryResponse>();

    expect(body.eligible_count).toBe(0);
    expect(body.today_count).toBe(0);
    expect(body.overdue_count).toBe(0);
    // Still present in the fuller task list backing the todo entity.
    expect(body.tasks).toHaveLength(1);
  });

  it("excludes done and archived tasks from every count", async () => {
    insertTask(db, userId, "Done", { due_at: null, state: "done" });
    insertTask(db, userId, "Archived overdue", {
      due_at: "2020-01-01",
      state: "overdue",
      archived_at: new Date(),
    });

    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    const body = res.json<HaSummaryResponse>();

    expect(body.eligible_count).toBe(0);
    expect(body.today_count).toBe(0);
    expect(body.overdue_count).toBe(0);
    expect(body.tasks).toEqual([]);
  });
});
