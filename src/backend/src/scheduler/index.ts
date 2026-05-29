import cron from "node-cron";
import type { Db } from "../db/client.js";
import { runTick } from "./tick.js";
import { runDigestTick } from "./digest.js";
import type { SupervisorClient } from "../ha/supervisor.js";
import { syncUsers } from "../ha/user-sync.js";
import { updateSyncState } from "../ha/sync-state.js";

type Logger = {
  debug?: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

async function runUserSync(
  db: Db,
  supervisorClient: SupervisorClient,
  logger?: Logger,
): Promise<void> {
  try {
    const haUsers = await supervisorClient.getUsers();
    updateSyncState(true, null);
    const counts = syncUsers(haUsers, db);
    updateSyncState(true, new Date());
    if (logger) {
      logger.info(
        {
          added: counts.added,
          updated: counts.updated,
          deactivated: counts.deactivated,
          reactivated: counts.reactivated,
        },
        "scheduler.user-sync-ok",
      );
    }
  } catch (err) {
    updateSyncState(false, null);
    const message = err instanceof Error ? err.message : String(err);
    if (logger) logger.warn({ err: message }, "scheduler.user-sync-failed");
    else console.warn("User sync failed:", message);
  }
}

export function startScheduler(
  db: Db,
  logger?: Logger,
  supervisorClient?: SupervisorClient | null,
  userSyncIntervalMinutes = 30,
): void {
  cron.schedule("* * * * *", () => {
    void runTick(db, undefined, logger).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (logger) logger.error({ err: message }, "scheduler.tick-failed");
      else console.error("Scheduler tick failed:", err);
    });
  });

  // Daily digest evaluation, every minute. Internally guarded against a missing
  // Supervisor token (dev mode), so it is safe to register unconditionally.
  cron.schedule("* * * * *", () => {
    void runDigestTick(db, supervisorClient ?? null, undefined, logger).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (logger) logger.error({ err: message }, "scheduler.digest-tick-failed");
      else console.error("Digest tick failed:", err);
    });
  });

  if (!supervisorClient) return;

  // Periodic user sync on a configurable interval (default 30 min).
  // `*/N * * * *` is only valid when N divides 60 evenly. For other values
  // (e.g. 7, 45, 90) use setInterval so the gap is always exactly N minutes.
  const CRON_SAFE = new Set([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60]);

  if (CRON_SAFE.has(userSyncIntervalMinutes)) {
    const expr =
      userSyncIntervalMinutes === 60 ? "0 * * * *" : `*/${userSyncIntervalMinutes} * * * *`;
    cron.schedule(expr, () => {
      void runUserSync(db, supervisorClient, logger);
    });
  } else {
    setInterval(
      () => {
        void runUserSync(db, supervisorClient, logger);
      },
      userSyncIntervalMinutes * 60 * 1000,
    );
  }
}

export { runUserSync };
