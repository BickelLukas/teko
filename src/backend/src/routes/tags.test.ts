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

// ── Tag CRUD ──────────────────────────────────────────────────────────────────

describe("GET /api/tags", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns empty array when no tags exist", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tags" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns tags with usage counts", async () => {
    const tagRes = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Kitchen", color: "green" },
    });
    expect(tagRes.statusCode).toBe(201);
    const tag = tagRes.json<{ id: number; name: string; color: string }>();

    const listRes = await app.inject({ method: "GET", url: "/api/tags" });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json<{ id: number; name: string; color: string; count: number }[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: tag.id, name: "Kitchen", color: "green", count: 0 });
  });
});

describe("POST /api/tags", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a tag with valid name and color", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Garden", color: "lime" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: number; name: string; color: string }>();
    expect(body.name).toBe("Garden");
    expect(body.color).toBe("lime");
    expect(body.id).toBeTypeOf("number");
  });

  it("trims whitespace from name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "  Bathroom  ", color: "teal" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ name: string }>().name).toBe("Bathroom");
  });

  it("rejects invalid color key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Test", color: "neonpurple" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects empty name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "   ", color: "blue" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 on duplicate name (case-insensitive)", async () => {
    await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Kitchen", color: "green" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "kitchen", color: "blue" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 on duplicate name (mixed case)", async () => {
    await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Living Room", color: "amber" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "LIVING ROOM", color: "orange" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("PATCH /api/tags/:id", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("renames a tag", async () => {
    const { json: tag } = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Old Name", color: "blue" },
    });
    const t = tag<{ id: number }>();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/tags/${t.id}`,
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: string }>().name).toBe("New Name");
  });

  it("recolors a tag", async () => {
    const { json: tag } = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Tag", color: "blue" },
    });
    const t = tag<{ id: number }>();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/tags/${t.id}`,
      payload: { color: "rose" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ color: string }>().color).toBe("rose");
  });

  it("returns 404 for unknown tag", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/tags/9999",
      payload: { color: "blue" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 on name conflict with another tag", async () => {
    await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Alpha", color: "blue" },
    });
    const beta = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Beta", color: "green" },
    });
    const betaId = beta.json<{ id: number }>().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/tags/${betaId}`,
      payload: { name: "alpha" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("DELETE /api/tags/:id", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("deletes a tag", async () => {
    const { json: tag } = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "ToDelete", color: "slate" },
    });
    const t = tag<{ id: number }>();

    const res = await app.inject({ method: "DELETE", url: `/api/tags/${t.id}` });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/tags" });
    expect(list.json()).toEqual([]);
  });

  it("delete propagates: tag removed from tasks, tasks remain", async () => {
    const tagRes = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Basement", color: "purple" },
    });
    const tagId = tagRes.json<{ id: number }>().id;

    // Create two tasks and assign the tag
    const taskA = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Task A" },
    });
    const taskB = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Task B" },
    });
    const idA = taskA.json<{ id: string }>().id;
    const idB = taskB.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${idA}/tags`,
      payload: { tag_ids: [tagId] },
    });
    await app.inject({
      method: "POST",
      url: `/api/tasks/${idB}/tags`,
      payload: { tag_ids: [tagId] },
    });

    // Delete the tag
    const del = await app.inject({ method: "DELETE", url: `/api/tags/${tagId}` });
    expect(del.statusCode).toBe(204);

    // Tags gone from tasks
    const tagsA = await app.inject({ method: "GET", url: `/api/tasks/${idA}/tags` });
    expect(tagsA.json()).toEqual([]);
    const tagsB = await app.inject({ method: "GET", url: `/api/tasks/${idB}/tags` });
    expect(tagsB.json()).toEqual([]);

    // Tasks themselves remain
    const tasks = await app.inject({ method: "GET", url: "/api/tasks?scope=all" });
    const titles = tasks.json<{ title: string }[]>().map((t) => t.title);
    expect(titles).toContain("Task A");
    expect(titles).toContain("Task B");
  });

  it("returns 404 for unknown tag", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/tags/9999" });
    expect(res.statusCode).toBe(404);
  });
});

// ── Task tag assignment ───────────────────────────────────────────────────────

describe("POST /api/tasks/:id/tags", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("assigns tags to a task (replace semantics)", async () => {
    const [blueRes, greenRes] = await Promise.all([
      app.inject({ method: "POST", url: "/api/tags", payload: { name: "Blue", color: "blue" } }),
      app.inject({ method: "POST", url: "/api/tags", payload: { name: "Green", color: "green" } }),
    ]);
    const blueId = blueRes.json<{ id: number }>().id;
    const greenId = greenRes.json<{ id: number }>().id;

    const task = await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "T" } });
    const taskId = task.json<{ id: string }>().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [blueId, greenId] },
    });
    expect(res.statusCode).toBe(200);
    const assigned = res.json<{ id: number }[]>();
    expect(assigned.map((t) => t.id).sort()).toEqual([blueId, greenId].sort());
  });

  it("replaces existing tags", async () => {
    const [aRes, bRes] = await Promise.all([
      app.inject({ method: "POST", url: "/api/tags", payload: { name: "A", color: "blue" } }),
      app.inject({ method: "POST", url: "/api/tags", payload: { name: "B", color: "green" } }),
    ]);
    const aId = aRes.json<{ id: number }>().id;
    const bId = bRes.json<{ id: number }>().id;

    const task = await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "T" } });
    const taskId = task.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [aId] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [bId] },
    });
    expect(res.statusCode).toBe(200);
    const tags = res.json<{ id: number }[]>();
    expect(tags).toHaveLength(1);
    expect(tags[0]!.id).toBe(bId);
  });

  it("clears all tags when tag_ids is empty", async () => {
    const tagRes = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Tag", color: "rose" },
    });
    const tagId = tagRes.json<{ id: number }>().id;

    const task = await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "T" } });
    const taskId = task.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [tagId] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns 400 if any tag_id does not exist", async () => {
    const task = await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "T" } });
    const taskId = task.json<{ id: string }>().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [99999] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for unknown task", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${randomUUID()}/tags`,
      payload: { tag_ids: [] },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Tag filter on GET /api/tasks ──────────────────────────────────────────────

describe("GET /api/tasks?tags= (AND filter)", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("filters tasks by single tag", async () => {
    const tagRes = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Urgent", color: "rose" },
    });
    const tagId = tagRes.json<{ id: number }>().id;

    const taskA = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Tagged" },
    });
    await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Untagged" },
    });
    const idA = taskA.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${idA}/tags`,
      payload: { tag_ids: [tagId] },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/tasks?scope=all&tags=${tagId}`,
    });
    expect(res.statusCode).toBe(200);
    const tasks = res.json<{ title: string }[]>();
    expect(tasks.map((t) => t.title)).toContain("Tagged");
    expect(tasks.map((t) => t.title)).not.toContain("Untagged");
  });

  it("AND semantics: both tags required", async () => {
    const [aRes, bRes] = await Promise.all([
      app.inject({ method: "POST", url: "/api/tags", payload: { name: "A", color: "blue" } }),
      app.inject({ method: "POST", url: "/api/tags", payload: { name: "B", color: "green" } }),
    ]);
    const aId = aRes.json<{ id: number }>().id;
    const bId = bRes.json<{ id: number }>().id;

    const taskBoth = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Both" },
    });
    const taskA = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Only A" },
    });
    const bothId = taskBoth.json<{ id: string }>().id;
    const aOnlyId = taskA.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${bothId}/tags`,
      payload: { tag_ids: [aId, bId] },
    });
    await app.inject({
      method: "POST",
      url: `/api/tasks/${aOnlyId}/tags`,
      payload: { tag_ids: [aId] },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/tasks?scope=all&tags=${aId},${bId}`,
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json<{ title: string }[]>().map((t) => t.title);
    expect(titles).toContain("Both");
    expect(titles).not.toContain("Only A");
  });

  it("task response includes its tags", async () => {
    const tagRes = await app.inject({
      method: "POST",
      url: "/api/tags",
      payload: { name: "Work", color: "purple" },
    });
    const tagId = tagRes.json<{ id: number }>().id;

    const taskRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "T" },
    });
    const taskId = taskRes.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/tags`,
      payload: { tag_ids: [tagId] },
    });

    const listRes = await app.inject({ method: "GET", url: "/api/tasks?scope=all" });
    const tasks = listRes.json<{ id: string; tags: { id: number; name: string }[] }[]>();
    const task = tasks.find((t) => t.id === taskId);
    expect(task).toBeDefined();
    expect(task!.tags).toHaveLength(1);
    expect(task!.tags[0]!.name).toBe("Work");
  });
});
