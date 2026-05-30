import { and, eq, isNull, isNotNull, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { SupervisorClient } from "../ha/supervisor.js";
import { computeTaskState, computeEligibleStart } from "../domain/recurrence.js";
import { buildDigest, type DigestData, type DigestTaskInfo } from "../domain/digest.js";
import { getNow } from "../domain/clock.js";
import { bareNotifyServiceName } from "@teko/shared";

type Logger = {
  debug?: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

type TaskRow = typeof schema.tasks.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

const DEFAULT_DIGEST_TIME = "08:00";

// ── Timezone helpers ────────────────────────────────────────────────────────

function localParts(date: Date, timeZone: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Local calendar date ("YYYY-MM-DD") of an instant in the household timezone. */
export function localDateKey(date: Date, timeZone: string): string {
  return localParts(date, timeZone).date;
}

/** Local wall-clock time ("HH:MM") of an instant in the household timezone. */
export function localTimeKey(date: Date, timeZone: string): string {
  return localParts(date, timeZone).time;
}

// ── Task categorization ───────────────────────────────────────────────────────

export type CategorizedTasks = {
  overdue: DigestTaskInfo[];
  dueToday: DigestTaskInfo[];
  newlyEligible: DigestTaskInfo[];
};

/**
 * Sorts a user's candidate tasks into the three digest buckets, using the
 * household-local calendar date to decide what counts as "today". Pure given
 * its inputs.
 */
export function categorizeUserTasks(
  tasks: TaskRow[],
  now: Date,
  timeZone: string,
): CategorizedTasks {
  const today = localDateKey(now, timeZone);
  const overdue: DigestTaskInfo[] = [];
  const dueToday: DigestTaskInfo[] = [];
  const newlyEligible: DigestTaskInfo[] = [];

  for (const task of tasks) {
    const state = computeTaskState(task, today);
    if (state === "archived" || state === "done" || state === "not_yet") continue;

    if (state === "overdue") {
      overdue.push({ title: task.title });
      continue;
    }

    if (state === "eligible" && task.due_at !== null) {
      const windowDays = task.completion_window_days ?? 0;

      if (task.due_at === today) {
        // Due today
        dueToday.push({ title: task.title });
        continue;
      }

      // Became eligible today (window opened today but due later)
      const eligibleStart = computeEligibleStart(task.due_at, windowDays);
      if (eligibleStart === today && windowDays > 0) {
        newlyEligible.push({ title: task.title });
      }
    }
  }

  return { overdue, dueToday, newlyEligible };
}

/** Fetches a user's relevant tasks (own + unassigned, active) and categorizes them. */
export function gatherDigestData(db: Db, user: UserRow, now: Date, timeZone: string): DigestData {
  const tasks = db
    .select()
    .from(schema.tasks)
    .where(
      and(
        isNull(schema.tasks.archived_at),
        or(eq(schema.tasks.assignee_id, user.id), isNull(schema.tasks.assignee_id)),
      ),
    )
    .all();

  const buckets = categorizeUserTasks(tasks, now, timeZone);
  return {
    name: user.display_name ?? user.name,
    locale: user.locale,
    notificationTime: user.notification_time,
    ...buckets,
  };
}

// ── The periodic job ────────────────────────────────────────────────────────

/**
 * Evaluates every user's daily digest for the current minute. Idempotent across
 * the day (and container restarts) via users.last_digest_sent_date. Guarded
 * against a missing Supervisor token — without it there is no way to reach HA's
 * notify services, so the job is a no-op.
 */
export async function runDigestTick(
  db: Db,
  supervisorClient: SupervisorClient | null,
  now: Date = getNow(),
  logger?: Logger,
): Promise<void> {
  if (!supervisorClient) return;

  let timeZone: string;
  try {
    timeZone = await supervisorClient.getTimeZone();
  } catch (err) {
    // Without the household timezone we cannot tell whose digest is due now.
    logger?.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "digest.timezone-unavailable",
    );
    return;
  }

  const todayKey = localDateKey(now, timeZone);
  const currentTime = localTimeKey(now, timeZone);

  const candidates = db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.notify_digest_enabled, true),
        isNotNull(schema.users.notification_service),
        eq(schema.users.is_active, true),
      ),
    )
    .all();

  for (const user of candidates) {
    const userTime = user.notification_time ?? DEFAULT_DIGEST_TIME;
    if (userTime !== currentTime) continue;
    if (user.last_digest_sent_date === todayKey) continue; // already considered today
    if (user.notification_service === null) continue; // satisfies the type narrowing

    try {
      const data = gatherDigestData(db, user, now, timeZone);
      const message = buildDigest(data);

      if (message === null) {
        // Nothing to say. Record that we've considered today so we don't
        // re-evaluate every minute, and stay silent.
        markSent(db, user.id, todayKey);
        logger?.debug?.({ user: user.id }, "digest.skip-empty");
        continue;
      }

      const serviceName = bareNotifyServiceName(user.notification_service);
      const result = await supervisorClient.sendNotification(serviceName, {
        title: message.title,
        message: message.body,
      });

      if (result.ok) {
        markSent(db, user.id, todayKey);
        logger?.info({ user: user.id, service: serviceName }, "digest.sent");
      } else {
        // Leave last_digest_sent_date alone so we retry at the same time
        // tomorrow — but never again today, to avoid spamming during an HA
        // outage.
        logger?.warn(
          { user: user.id, service: serviceName, status: result.status, body: result.body },
          "digest.send-failed",
        );
      }
    } catch (err) {
      logger?.error(
        { user: user.id, err: err instanceof Error ? err.message : String(err) },
        "digest.user-failed",
      );
    }
  }
}

function markSent(db: Db, userId: string, dateKey: string): void {
  db.update(schema.users)
    .set({ last_digest_sent_date: dateKey })
    .where(eq(schema.users.id, userId))
    .run();
}
