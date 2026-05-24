import { eq, notInArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";
import type { HaUser } from "./supervisor.js";
import { upsertHaUser } from "./user-upsert.js";

export type SyncCounts = {
  added: number;
  updated: number;
  deactivated: number;
  reactivated: number;
};

/**
 * Reconciles Teko's users table against the HA user list in a single atomic
 * transaction. Upserts each HA user; soft-deactivates Teko users absent from
 * the list. Never hard-deletes — history references stay intact.
 */
export function syncUsers(haUsers: HaUser[], db: Db): SyncCounts {
  let added = 0;
  let updated = 0;
  let deactivated = 0;
  let reactivated = 0;

  db.transaction((tx) => {
    for (const haUser of haUsers) {
      const { action } = upsertHaUser(tx as unknown as Db, haUser.id, haUser.name);
      if (action === "inserted") added++;
      else if (action === "updated") updated++;
      else if (action === "reactivated") reactivated++;
    }

    // Soft-deactivate Teko users absent from the HA list.
    // Guard: skip if haUsers is empty to avoid accidentally deactivating everyone
    // when the Supervisor API returns an unexpected empty response.
    if (haUsers.length > 0) {
      const haIds = haUsers.map((u) => u.id);
      const toDeactivate = (tx as unknown as Db)
        .select()
        .from(schema.users)
        .where(notInArray(schema.users.ha_user_id, haIds))
        .all()
        .filter((u) => u.is_active);

      for (const user of toDeactivate) {
        (tx as unknown as Db)
          .update(schema.users)
          .set({ is_active: false })
          .where(eq(schema.users.id, user.id))
          .run();
        deactivated++;
      }
    }
  });

  return { added, updated, deactivated, reactivated };
}
