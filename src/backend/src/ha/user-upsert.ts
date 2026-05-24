import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";

type UserRow = typeof schema.users.$inferSelect;

export type UpsertAction = "found" | "inserted" | "updated" | "reactivated";

export type UpsertResult = {
  user: UserRow;
  action: UpsertAction;
};

/**
 * Canonical "ensure HA user exists in Teko" — used by both the sync job and
 * the ingress auth branch. Inserts on first contact, reactivates if previously
 * soft-deactivated, and updates name/is_admin when HA data changes.
 * User-owned preferences (locale, theme, display_name, etc.) are never touched.
 */
export function upsertHaUser(
  db: Db,
  haUserId: string,
  name: string,
  isAdmin: boolean,
): UpsertResult {
  const existing = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.ha_user_id, haUserId))
    .get();

  if (!existing) {
    const id = randomUUID();
    db.insert(schema.users)
      .values({ id, ha_user_id: haUserId, name, is_admin: isAdmin, is_active: true })
      .run();
    const user = db.select().from(schema.users).where(eq(schema.users.ha_user_id, haUserId)).get()!;
    return { user, action: "inserted" };
  }

  const wasInactive = !existing.is_active;
  const nameChanged = existing.name !== name;
  const adminChanged = existing.is_admin !== isAdmin;

  if (wasInactive || nameChanged || adminChanged) {
    db.update(schema.users)
      .set({ name, is_admin: isAdmin, is_active: true })
      .where(eq(schema.users.ha_user_id, haUserId))
      .run();
    const user: UserRow = { ...existing, name, is_admin: isAdmin, is_active: true };
    return { user, action: wasInactive ? "reactivated" : "updated" };
  }

  return { user: existing, action: "found" };
}
