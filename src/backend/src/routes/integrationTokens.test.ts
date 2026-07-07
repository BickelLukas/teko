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
import { hashIntegrationToken } from "../domain/integrationTokens";

const MIGRATIONS = path.join(process.cwd(), "drizzle/migrations");

const DEV_CONFIG = {
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

// Non-dev config exercises the ingress/bearer auth branches instead of the
// dev-mode short-circuit.
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

const INGRESS_HEADERS = {
  "x-ingress-path": "/hassio/ingress/teko",
  "x-remote-user-id": "test-user",
  "x-remote-user-name": "Test User",
};

// ── Token CRUD (dev-mode auth) ─────────────────────────────────────────────────

describe("integration token CRUD", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    ({ db } = buildTestDb());
    app = await buildApp(db, DEV_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a token, returning the raw value once", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integration/tokens",
      payload: { label: "Home Assistant" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; label: string; token: string }>();
    expect(body.label).toBe("Home Assistant");
    expect(body.token).toBeTypeOf("string");
    expect(body.token.length).toBeGreaterThan(20);

    // Only the hash is persisted.
    const row = db.select().from(schema.integrationTokens).all()[0];
    expect(row?.token_hash).toBe(hashIntegrationToken(body.token));
  });

  it("lists active tokens without the raw value", async () => {
    await app.inject({
      method: "POST",
      url: "/api/integration/tokens",
      payload: { label: "Home Assistant" },
    });

    const res = await app.inject({ method: "GET", url: "/api/integration/tokens" });
    expect(res.statusCode).toBe(200);
    const list = res.json<Record<string, unknown>[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("token");
    expect(list[0]).toMatchObject({ label: "Home Assistant" });
  });

  it("revokes a token; it disappears from the list", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/integration/tokens",
      payload: { label: "Home Assistant" },
    });
    const id = created.json<{ id: string }>().id;

    const del = await app.inject({ method: "DELETE", url: `/api/integration/tokens/${id}` });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/integration/tokens" });
    expect(list.json()).toEqual([]);
  });

  it("returns 404 revoking an unknown token", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/integration/tokens/${randomUUID()}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an empty label", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integration/tokens",
      payload: { label: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Bearer auth on /api/ha/* (non-dev auth) ────────────────────────────────────

describe("bearer auth on /api/ha/*", () => {
  let app: FastifyInstance;
  let db: Db;
  let userId: string;

  beforeEach(async () => {
    ({ db, userId } = buildTestDb());
    app = await buildApp(db, PROD_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  function insertToken(rawToken: string, revoked = false): void {
    db.insert(schema.integrationTokens)
      .values({
        id: randomUUID(),
        token_hash: hashIntegrationToken(rawToken),
        label: "Home Assistant",
        created_by: userId,
        revoked_at: revoked ? new Date() : null,
      })
      .run();
  }

  it("accepts a valid bearer token on /api/ha/summary", async () => {
    insertToken("valid-raw-token");

    const res = await app.inject({
      method: "GET",
      url: "/api/ha/summary",
      headers: { authorization: "Bearer valid-raw-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible_count: 0,
      today_count: 0,
      overdue_count: 0,
      tasks: [],
    });
  });

  it("rejects a missing bearer token on /api/ha/summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/ha/summary" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown bearer token", async () => {
    insertToken("valid-raw-token");

    const res = await app.inject({
      method: "GET",
      url: "/api/ha/summary",
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a revoked bearer token", async () => {
    insertToken("revoked-raw-token", true);

    const res = await app.inject({
      method: "GET",
      url: "/api/ha/summary",
      headers: { authorization: "Bearer revoked-raw-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not accept a bearer token outside /api/ha/*", async () => {
    insertToken("valid-raw-token");

    const res = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: "Bearer valid-raw-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("still accepts ingress auth on /api/ha/summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/ha/summary",
      headers: INGRESS_HEADERS,
    });
    expect(res.statusCode).toBe(200);
  });
});
