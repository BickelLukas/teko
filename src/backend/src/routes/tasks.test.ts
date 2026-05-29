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
import type { TaskListResponse, TaskResponse } from "@teko/shared";

const MIGRATIONS = path.join(process.cwd(), "drizzle/migrations");

const TEST_CONFIG = {
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

function buildTestDb(): { db: Db; userId: string } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS });

  const userId = randomUUID();
  db.insert(schema.users)
    .values({
      id: userId,
      ha_user_id: "test-user",
      name: "Test User",
      is_admin: false,
    })
    .run();

  return { db, userId };
}

describe("GET /api/tasks", () => {
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

  it("returns empty list when no tasks", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns only the user's open tasks", async () => {
    db.insert(schema.tasks)
      .values({
        id: randomUUID(),
        title: "My task",
        assignee_id: userId,
        created_by: userId,
        state: "eligible",
      })
      .run();

    // done task should not appear
    db.insert(schema.tasks)
      .values({
        id: randomUUID(),
        title: "Done task",
        assignee_id: userId,
        created_by: userId,
        state: "done",
      })
      .run();

    const res = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TaskListResponse;
    expect(body).toHaveLength(1);
    expect(body[0]?.title).toBe("My task");
  });
});

describe("POST /api/tasks", () => {
  let app: FastifyInstance;
  let db: Db;
  let userId: string;

  beforeEach(async () => {
    ({ db, userId } = buildTestDb());
    // suppress "unused variable" — userId used implicitly via auth middleware
    void userId;
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a task and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "New task", description: "Some details" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as TaskResponse;
    expect(body.title).toBe("New task");
    expect(body.description).toBe("Some details");
    expect(body.state).toBe("eligible");
    expect(body.id).toBeTruthy();
  });

  it("returns 400 when title is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { description: "No title" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when title is empty string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("one-off + future start_date → state=planned, planned_for set", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Buy milk", start_date: "2099-06-15" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as TaskResponse;
    expect(body.state).toBe("planned");
    expect(body.planned_for).toBeTruthy();
    expect(new Date(body.planned_for!).toISOString()).toContain("2099-06-15");
  });

  it("one-off + past start_date → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Buy milk", start_date: "2000-01-01" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("recurring fixed daily + no start_date → due now, eligible", async () => {
    const before = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Daily chore",
        recurrence_rule: "RRULE:FREQ=DAILY",
        recurrence_mode: "fixed",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as TaskResponse;
    expect(body.state).toBe("eligible");
    expect(body.next_due_at).toBeTruthy();
    // First occurrence is now, not the next interval.
    expect(new Date(body.next_due_at!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(body.next_due_at!).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("recurring after_completion + no start_date → due now, eligible", async () => {
    const before = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Water plants",
        recurrence_rule: "RRULE:FREQ=WEEKLY;INTERVAL=1",
        recurrence_mode: "after_completion",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as TaskResponse;
    expect(body.state).toBe("eligible");
    expect(body.next_due_at).toBeTruthy();
    // First occurrence is now, not now + one week.
    expect(new Date(body.next_due_at!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(body.next_due_at!).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("recurring fixed + future start_date → next_due_at on/after anchor", async () => {
    // Weekly on Mondays. 2099-06-15 is a Monday → next_due_at = that Monday.
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Weekly chore",
        start_date: "2099-06-15",
        recurrence_rule: "DTSTART:20000103T000000Z\nRRULE:FREQ=WEEKLY;INTERVAL=1",
        recurrence_mode: "fixed",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as TaskResponse;
    expect(body.next_due_at).toBeTruthy();
    // next_due_at must be on or after 2099-06-15T12:00:00Z
    expect(new Date(body.next_due_at!).getTime()).toBeGreaterThanOrEqual(
      new Date("2099-06-15T12:00:00Z").getTime(),
    );
  });

  it("recurring after_completion + future start_date → next_due_at = anchor", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Water plants",
        start_date: "2099-06-15",
        recurrence_rule: "RRULE:FREQ=WEEKLY;INTERVAL=1",
        recurrence_mode: "after_completion",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as TaskResponse;
    expect(body.next_due_at).toBeTruthy();
    // after_completion + anchor: first due = anchor itself (not anchor + interval)
    expect(new Date(body.next_due_at!).toISOString()).toContain("2099-06-15");
  });
});

describe("POST /api/tasks/:id/complete", () => {
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

  it("marks task done and returns 200 with streak/points", async () => {
    const taskId = randomUUID();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Complete me",
        assignee_id: userId,
        created_by: userId,
        state: "eligible",
      })
      .run();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/complete`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ streak: { current: number }; points_awarded: number }>();
    expect(body.points_awarded).toBe(1);
    expect(body.streak.current).toBe(0); // one-off task has no streak

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.state).toBe("done");

    const completion = db
      .select()
      .from(schema.completions)
      .where(eq(schema.completions.task_id, taskId))
      .get();
    expect(completion).toBeTruthy();
  });

  it("returns 404 for non-existent task", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${randomUUID()}/complete`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid task ID format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks/not-a-uuid/complete",
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when task already done", async () => {
    const taskId = randomUUID();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Already done",
        assignee_id: userId,
        created_by: userId,
        state: "done",
      })
      .run();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/complete`,
    });
    expect(res.statusCode).toBe(409);
  });

  it("recurring task cycles to next due date on completion", async () => {
    const taskId = randomUUID();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Vacuum",
        assignee_id: userId,
        created_by: userId,
        state: "eligible",
        recurrence_rule: "RRULE:FREQ=WEEKLY;INTERVAL=1",
        recurrence_mode: "after_completion",
        completion_window_days: 1,
        next_due_at: new Date(), // due now
      })
      .run();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/complete`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ streak: { current: number }; points_awarded: number }>();
    expect(body.streak.current).toBe(1); // first on-time completion → streak 1
    expect(body.points_awarded).toBe(1);

    // Should NOT be marked "done" — it should cycle
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.state).not.toBe("done");
    // next_due_at should be roughly a week from now
    expect(task?.next_due_at?.getTime()).toBeGreaterThan(Date.now());

    // Completion row exists
    const completion = db
      .select()
      .from(schema.completions)
      .where(eq(schema.completions.task_id, taskId))
      .get();
    expect(completion).toBeTruthy();
    expect(completion?.was_on_time).toBe(true);
  });
});

describe("POST /api/tasks/:id/schedule and /unschedule", () => {
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

  it("schedule sets planned_for and state=planned", async () => {
    const taskId = randomUUID();
    const nextDue = new Date();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Trim bushes",
        assignee_id: userId,
        created_by: userId,
        state: "eligible",
        recurrence_rule: "RRULE:FREQ=MONTHLY;INTERVAL=6",
        recurrence_mode: "fixed",
        completion_window_days: 30,
        next_due_at: nextDue,
      })
      .run();

    const plannedFor = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/schedule`,
      payload: { planned_for: plannedFor.toISOString() },
    });
    expect(res.statusCode).toBe(200);

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.state).toBe("planned");
    expect(task?.planned_for).toBeTruthy();
  });

  it("unschedule clears planned_for", async () => {
    const taskId = randomUUID();
    const nextDue = new Date();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Trim bushes",
        assignee_id: userId,
        created_by: userId,
        state: "planned",
        recurrence_rule: "RRULE:FREQ=MONTHLY;INTERVAL=6",
        recurrence_mode: "fixed",
        completion_window_days: 30,
        next_due_at: nextDue,
        planned_for: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      })
      .run();

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/unschedule`,
    });
    expect(res.statusCode).toBe(204);

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.planned_for).toBeNull();
  });
});

describe("POST /api/tasks/:id/snooze", () => {
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

  it("pushes next_due_at to until", async () => {
    const taskId = randomUUID();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Snooze me",
        assignee_id: userId,
        created_by: userId,
        state: "eligible",
        recurrence_rule: "RRULE:FREQ=DAILY",
        recurrence_mode: "fixed",
        completion_window_days: 0,
        next_due_at: new Date(),
      })
      .run();

    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/snooze`,
      payload: { until: until.toISOString() },
    });
    expect(res.statusCode).toBe(204);

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.next_due_at?.getTime()).toBeCloseTo(until.getTime(), -3);
    expect(task?.state).toBe("not_yet");
  });
});

describe("PATCH /api/tasks/:id", () => {
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

  function insertTask(overrides: Partial<typeof schema.tasks.$inferInsert> = {}) {
    const id = randomUUID();
    db.insert(schema.tasks)
      .values({ id, title: "Test task", created_by: userId, state: "eligible", ...overrides })
      .run();
    return id;
  }

  it("updates title and description", async () => {
    const id = insertTask();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { title: "Updated", description: "New desc" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TaskResponse;
    expect(body.title).toBe("Updated");
    expect(body.description).toBe("New desc");
  });

  it("adds recurrence rule — populates next_due_at and completion_window_days", async () => {
    const id = insertTask();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { recurrence_rule: "RRULE:FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TaskResponse;
    expect(body.recurrence_rule).toBeTruthy();
    expect(body.next_due_at).toBeTruthy();
    expect(body.completion_window_days).toBeGreaterThan(0);
    expect(["eligible", "not_yet"]).toContain(body.state);
  });

  it("clears recurrence when recurrence_rule sent as null", async () => {
    const id = insertTask({
      recurrence_rule: "RRULE:FREQ=DAILY",
      recurrence_mode: "fixed",
      completion_window_days: 1,
      next_due_at: new Date(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { recurrence_rule: null, recurrence_mode: null },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TaskResponse;
    expect(body.recurrence_rule).toBeNull();
    expect(body.recurrence_mode).toBeNull();
    expect(body.next_due_at).toBeNull();
    expect(body.completion_window_days).toBeNull();
    expect(body.state).toBe("eligible");
  });

  it("updates only completion_window_days without changing next_due_at", async () => {
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const id = insertTask({
      recurrence_rule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
      recurrence_mode: "fixed",
      completion_window_days: 1,
      next_due_at: due,
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { completion_window_days: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TaskResponse;
    expect(body.completion_window_days).toBe(3);
    // next_due_at should be unchanged
    expect(new Date(body.next_due_at!).getTime()).toBeCloseTo(due.getTime(), -3);
  });

  it("returns 404 for unknown task", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${randomUUID()}`,
      payload: { title: "x" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when task is archived", async () => {
    const id = insertTask({ archived_at: new Date() });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { title: "x" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 422 when parent_id would create a cycle", async () => {
    const parentId = insertTask();
    const childId = insertTask({ parent_id: parentId });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${parentId}`,
      payload: { parent_id: childId },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe("POST /api/_dev/tick", () => {
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

  it("returns updated count", async () => {
    // Insert a not_yet task whose due date is in the past
    const taskId = randomUUID();
    db.insert(schema.tasks)
      .values({
        id: taskId,
        title: "Past due",
        assignee_id: userId,
        created_by: userId,
        state: "not_yet",
        recurrence_rule: "RRULE:FREQ=DAILY",
        recurrence_mode: "fixed",
        completion_window_days: 0,
        next_due_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      })
      .run();

    const res = await app.inject({ method: "POST", url: "/api/_dev/tick" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { updated: number };
    expect(body.updated).toBe(1);

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    expect(task?.state).toBe("eligible");
  });
});
