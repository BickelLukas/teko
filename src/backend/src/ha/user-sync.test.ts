import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import path from "path";
import * as schema from "../db/schema";
import type { Db } from "../db/client";
import { syncUsers } from "./user-sync";
import type { HaUser } from "./supervisor";

const MIGRATIONS = path.join(process.cwd(), "drizzle/migrations");

function buildTestDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

function haUser(id: string, name: string): HaUser {
  return { id, name };
}

function activeUsers(db: Db) {
  return db.select().from(schema.users).where(eq(schema.users.is_active, true)).all();
}

function allUsers(db: Db) {
  return db.select().from(schema.users).all();
}

describe("syncUsers", () => {
  let db: Db;

  beforeEach(() => {
    db = buildTestDb();
  });

  it("first sync: inserts all HA users", () => {
    const result = syncUsers(
      [haUser("ha-1", "Alice"), haUser("ha-2", "Bob"), haUser("ha-3", "Charlie")],
      db,
    );

    expect(result.added).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.deactivated).toBe(0);
    expect(result.reactivated).toBe(0);
    expect(activeUsers(db)).toHaveLength(3);
  });

  it("steady state: no changes when HA list matches Teko users", () => {
    syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    const result = syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.deactivated).toBe(0);
    expect(result.reactivated).toBe(0);
    expect(activeUsers(db)).toHaveLength(2);
  });

  it("user added in HA: inserts new user", () => {
    syncUsers([haUser("ha-1", "Alice")], db);

    const result = syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(activeUsers(db)).toHaveLength(2);
  });

  it("user removed from HA: soft-deactivates, preserves row", () => {
    syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    const result = syncUsers([haUser("ha-1", "Alice")], db);

    expect(result.deactivated).toBe(1);
    expect(activeUsers(db)).toHaveLength(1);

    // Row still exists
    const all = allUsers(db);
    expect(all).toHaveLength(2);
    const bob = all.find((u) => u.ha_user_id === "ha-2");
    expect(bob?.is_active).toBe(false);
  });

  it("user re-added in HA: reactivates, preserves preferences", () => {
    syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    // Bob sets a custom locale
    db.update(schema.users)
      .set({ locale: "de", display_name: "Bobby" })
      .where(eq(schema.users.ha_user_id, "ha-2"))
      .run();

    // Bob removed
    syncUsers([haUser("ha-1", "Alice")], db);
    expect(activeUsers(db)).toHaveLength(1);

    // Bob re-added
    const result = syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    expect(result.reactivated).toBe(1);
    expect(activeUsers(db)).toHaveLength(2);

    // Preferences preserved
    const bob = db.select().from(schema.users).where(eq(schema.users.ha_user_id, "ha-2")).get();
    expect(bob?.locale).toBe("de");
    expect(bob?.display_name).toBe("Bobby");
    expect(bob?.is_active).toBe(true);
  });

  it("name changed in HA: updates name, increments updated count", () => {
    syncUsers([haUser("ha-1", "Alice")], db);

    const result = syncUsers([haUser("ha-1", "Alicia")], db);

    expect(result.updated).toBe(1);
    const user = db.select().from(schema.users).where(eq(schema.users.ha_user_id, "ha-1")).get();
    expect(user?.name).toBe("Alicia");
  });

  it("empty HA list: skips deactivation (safety guard)", () => {
    syncUsers([haUser("ha-1", "Alice"), haUser("ha-2", "Bob")], db);

    const result = syncUsers([], db);

    expect(result.deactivated).toBe(0);
    expect(activeUsers(db)).toHaveLength(2);
  });
});
