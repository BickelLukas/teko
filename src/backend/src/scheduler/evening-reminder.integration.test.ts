import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";
import { runEveningReminderTick, filterEveningTasks } from "./evening-reminder.js";
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
    getIngressPath: async () => "/44f73591_teko",
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
      notify_evening_reminder_enabled: true,
      notification_service: "notify.mobile_app_alice",
      evening_reminder_time: "19:00",
      ...overrides,
    })
    .run();
  return id;
}

function addTask(
  db: Db,
  userId: string,
  title: string,
  opts: {
    dueAt?: string;
    state?: "not_yet" | "eligible" | "overdue" | "done";
    windowDays?: number;
    assigneeId?: string | null;
    archivedAt?: Date | null;
    recurrenceRule?: string | null;
  } = {},
): void {
  db.insert(schema.tasks)
    .values({
      id: randomUUID(),
      title,
      assignee_id: opts.assigneeId !== undefined ? opts.assigneeId : userId,
      created_by: userId,
      state: opts.state ?? "eligible",
      due_at: opts.dueAt ?? "2026-05-29",
      completion_window_days: opts.windowDays ?? 0,
      archived_at: opts.archivedAt ?? null,
      recurrence_rule: opts.recurrenceRule ?? null,
    })
    .run();
}

// 2026-05-29 19:00 UTC (evening reminder fires at 19:00).
const NOW = new Date("2026-05-29T19:00:00Z");
const TODAY = "2026-05-29";

describe("runEveningReminderTick", () => {
  let db: Db;
  let sent: Sent[];

  beforeEach(() => {
    db = makeDb();
    sent = [];
  });

  it("is a no-op without a supervisor client (dev mode guard)", async () => {
    addUser(db);
    await runEveningReminderTick(db, null, NOW);
    expect(sent).toEqual([]);
  });

  it("sends reminder at the configured time and records the date", async () => {
    const userId = addUser(db);
    // overdue task: due May 27, window 0, now May 29 → overdue
    addTask(db, userId, "take out trash", {
      dueAt: "2026-05-27",
      state: "overdue",
    });

    await runEveningReminderTick(db, fakeClient({ sent }), NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.service).toBe("mobile_app_alice");
    expect(sent[0]!.payload.title).toBe("1 thing still open");
    expect(sent[0]!.payload.message).toContain("take out trash");
    expect(sent[0]!.payload.clickAction).toBe("/44f73591_teko");

    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_evening_reminder_sent_date).toBe(TODAY);
  });

  it("does not send twice the same day (restart idempotency)", async () => {
    const userId = addUser(db);
    addTask(db, userId, "take out trash", { state: "overdue" });

    await runEveningReminderTick(db, fakeClient({ sent }), NOW);
    // Same minute, same day — simulate a container restart.
    await runEveningReminderTick(db, fakeClient({ sent }), new Date("2026-05-29T19:00:30Z"));

    expect(sent).toHaveLength(1);
  });

  it("marks the date but sends nothing when there are no open tasks", async () => {
    const userId = addUser(db); // no tasks at all
    await runEveningReminderTick(db, fakeClient({ sent }), NOW);

    expect(sent).toEqual([]);
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_evening_reminder_sent_date).toBe(TODAY);
  });

  it("skips users whose evening_reminder_time does not match current minute", async () => {
    const userId = addUser(db, { evening_reminder_time: "20:00" });
    addTask(db, userId, "take out trash", { state: "overdue" });

    await runEveningReminderTick(db, fakeClient({ sent }), NOW);

    expect(sent).toEqual([]);
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_evening_reminder_sent_date).toBeNull();
  });

  it("leaves the date unset on send failure so it retries tomorrow", async () => {
    const userId = addUser(db);
    addTask(db, userId, "take out trash", { state: "overdue" });

    await runEveningReminderTick(
      db,
      fakeClient({ sent, result: { ok: false, status: 502, body: "boom" } }),
      NOW,
    );

    expect(sent).toHaveLength(1);
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user!.last_evening_reminder_sent_date).toBeNull();
  });

  it("skips users with evening reminder disabled or no notification target", async () => {
    const a = addUser(db, { notify_evening_reminder_enabled: false });
    const b = addUser(db, { notification_service: null });
    addTask(db, a, "task a", { state: "overdue" });
    addTask(db, b, "task b", { state: "overdue" });

    await runEveningReminderTick(db, fakeClient({ sent }), NOW);

    expect(sent).toEqual([]);
  });
});

describe("filterEveningTasks", () => {
  const tz = "UTC";

  function taskRow(
    overrides: Partial<typeof schema.tasks.$inferSelect>,
  ): typeof schema.tasks.$inferSelect {
    return {
      id: randomUUID(),
      title: "Task",
      description: null,
      assignee_id: null,
      state: "eligible",
      created_at: NOW,
      created_by: "creator",
      archived_at: null,
      recurrence_rule: null,
      recurrence_mode: null,
      completion_window_days: 0,
      due_at: null,
      points: null,
      exposed_to_ha: false,
      ...overrides,
    };
  }

  it("includes overdue tasks", () => {
    const tasks = [taskRow({ title: "overdue task", state: "overdue", due_at: "2026-05-27" })];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result.map((t) => t.title)).toEqual(["overdue task"]);
  });

  it("includes eligible task with due_at today (deadline is today)", () => {
    const tasks = [
      taskRow({
        title: "due today",
        state: "eligible",
        due_at: "2026-05-29",
        completion_window_days: 0,
      }),
    ];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result.map((t) => t.title)).toEqual(["due today"]);
  });

  it("excludes eligible task with due_at in the future (window flexibility)", () => {
    // due Jun 12, window 14 → eligible since May 29, but deadline not yet
    const tasks = [
      taskRow({
        title: "future eligible",
        state: "eligible",
        due_at: "2026-06-12",
        completion_window_days: 14,
      }),
    ];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result).toEqual([]);
  });

  it("excludes not_yet tasks", () => {
    // due Jun 30, window 0 → not_yet
    const tasks = [taskRow({ title: "not yet", due_at: "2026-06-30", completion_window_days: 0 })];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result).toEqual([]);
  });

  it("excludes done tasks", () => {
    const tasks = [taskRow({ title: "done", state: "done", due_at: null })];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result).toEqual([]);
  });

  it("excludes Someday items (eligible with no due_at)", () => {
    const tasks = [taskRow({ title: "someday", state: "eligible", due_at: null })];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result).toEqual([]);
  });

  it("excludes archived tasks", () => {
    const tasks = [
      taskRow({
        title: "archived",
        state: "overdue",
        due_at: "2026-05-27",
        archived_at: NOW,
      }),
    ];
    const result = filterEveningTasks(tasks, NOW, tz);
    expect(result).toEqual([]);
  });

  it("timezone: task due tomorrow in Berlin is NOT in today's reminder", () => {
    // 2026-05-29 19:00 UTC = 2026-05-29 21:00 Europe/Berlin
    // Task due "2026-05-30" — today in Berlin is "2026-05-29" → not included
    const berlinNow = new Date("2026-05-29T19:00:00Z");
    const tasks = [
      taskRow({
        title: "tomorrow in berlin",
        state: "eligible",
        due_at: "2026-05-30",
        completion_window_days: 0,
      }),
    ];
    const result = filterEveningTasks(tasks, berlinNow, "Europe/Berlin");
    expect(result).toEqual([]);
  });

  it("timezone: task due today in household timezone is included", () => {
    // 2026-05-29 19:00 UTC = 2026-05-29 21:00 Europe/Berlin
    // Task due "2026-05-29" — today in Berlin is "2026-05-29" → included
    const berlinNow = new Date("2026-05-29T19:00:00Z");
    const tasks = [
      taskRow({
        title: "due today berlin",
        state: "eligible",
        due_at: "2026-05-29",
        completion_window_days: 0,
      }),
    ];
    const result = filterEveningTasks(tasks, berlinNow, "Europe/Berlin");
    expect(result.map((t) => t.title)).toEqual(["due today berlin"]);
  });
});
