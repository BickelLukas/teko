import { and, eq, isNull, isNotNull, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { SupervisorClient } from "../ha/supervisor.js";
import { computeTaskState } from "../domain/recurrence.js";
import { buildEveningReminder, type EveningReminderTask } from "../domain/evening-reminder.js";
import { getNow } from "../domain/clock.js";
import { bareNotifyServiceName } from "@teko/shared";
import { localDateKey, localTimeKey } from "./digest.js";

type Logger = {
  debug?: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

type TaskRow = typeof schema.tasks.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

const DEFAULT_EVENING_REMINDER_TIME = "19:00";

/**
 * Filters a user's candidate tasks to those that belong in the evening reminder:
 * tasks in overdue state, or in eligible state with due_at = today (local date).
 *
 * Excludes: not_yet, done, archived, Someday items (eligible + no due_at),
 * and eligible tasks whose due_at is in the future (window still open).
 */
export function filterEveningTasks(
  tasks: TaskRow[],
  now: Date,
  timeZone: string,
): EveningReminderTask[] {
  const today = localDateKey(now, timeZone);
  const result: EveningReminderTask[] = [];

  for (const task of tasks) {
    const state = computeTaskState(task, now);
    if (state === "archived" || state === "done" || state === "not_yet") continue;

    if (state === "overdue") {
      result.push({ title: task.title });
      continue;
    }

    if (state === "eligible" && task.due_at !== null) {
      // Include only when the deadline is today. Eligible tasks with future
      // due_at still have window flexibility — surfacing them defeats the
      // calm-by-default window design.
      if (localDateKey(task.due_at, timeZone) === today) {
        result.push({ title: task.title });
      }
    }
    // eligible + due_at IS NULL → Someday item, always excluded
  }

  return result;
}

/** Fetches a user's candidate tasks (own + unassigned, not archived) and filters them. */
function gatherEveningTasks(
  db: Db,
  user: UserRow,
  now: Date,
  timeZone: string,
): EveningReminderTask[] {
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

  return filterEveningTasks(tasks, now, timeZone);
}

/**
 * Evaluates every user's evening reminder for the current minute. Idempotent
 * across the day (and container restarts) via users.last_evening_reminder_sent_date.
 * Guarded against a missing Supervisor token — without it there is no way to reach
 * HA's notify services, so the job is a no-op.
 */
export async function runEveningReminderTick(
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
    logger?.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "evening-reminder.timezone-unavailable",
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
        eq(schema.users.notify_evening_reminder_enabled, true),
        isNotNull(schema.users.notification_service),
        eq(schema.users.is_active, true),
      ),
    )
    .all();

  for (const user of candidates) {
    const userTime = user.evening_reminder_time ?? DEFAULT_EVENING_REMINDER_TIME;
    if (userTime !== currentTime) continue;
    if (user.last_evening_reminder_sent_date === todayKey) continue;
    if (user.notification_service === null) continue;

    try {
      const openTasks = gatherEveningTasks(db, user, now, timeZone);
      const message = buildEveningReminder({ locale: user.locale, openTasks });

      if (message === null) {
        markSent(db, user.id, todayKey);
        logger?.debug?.({ user: user.id }, "evening-reminder.skip-empty");
        continue;
      }

      const serviceName = bareNotifyServiceName(user.notification_service);
      const result = await supervisorClient.sendNotification(serviceName, {
        title: message.title,
        message: message.body,
      });

      if (result.ok) {
        markSent(db, user.id, todayKey);
        logger?.info({ user: user.id, service: serviceName }, "evening-reminder.sent");
      } else {
        logger?.warn(
          { user: user.id, service: serviceName, status: result.status, body: result.body },
          "evening-reminder.send-failed",
        );
      }
    } catch (err) {
      logger?.error(
        { user: user.id, err: err instanceof Error ? err.message : String(err) },
        "evening-reminder.user-failed",
      );
    }
  }
}

function markSent(db: Db, userId: string, dateKey: string): void {
  db.update(schema.users)
    .set({ last_evening_reminder_sent_date: dateKey })
    .where(eq(schema.users.id, userId))
    .run();
}
