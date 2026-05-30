import { and, isNull, isNotNull, ne, inArray, gt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { computeTaskState } from "../domain/recurrence.js";
import { detectBrokenStreaks } from "../domain/streaks.js";
import { getNow } from "../domain/clock.js";

type Logger = {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

const fallbackLogger: Logger = {
  info: (obj, msg) => console.log(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

export async function runTick(
  db: Db,
  now: Date = getNow(),
  logger: Logger = fallbackLogger,
): Promise<number> {
  const tasks = db
    .select()
    .from(schema.tasks)
    .where(
      and(
        isNull(schema.tasks.archived_at),
        ne(schema.tasks.state, "done"),
        isNotNull(schema.tasks.due_at),
      ),
    )
    .all();

  let updated = 0;
  const newlyOverdueTasks: (typeof schema.tasks.$inferSelect)[] = [];

  for (const task of tasks) {
    try {
      const computed = computeTaskState(task, now);

      // archived derived from archived_at; done = one-off completion — neither stored as state
      if (computed === "archived" || computed === "done") continue;

      if (task.state === computed) continue;

      if (computed === "overdue" && task.state !== "overdue") {
        newlyOverdueTasks.push(task);
      }

      const updates: {
        state: "not_yet" | "eligible" | "overdue" | "done";
      } = { state: computed };

      db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, task.id)).run();

      logger.info(
        { task: task.id, title: task.title, from: task.state, to: computed },
        "tick.state-change",
      );
      updated++;
    } catch (err) {
      // Don't let one bad row kill the whole tick.
      logger.error(
        { task: task.id, err: err instanceof Error ? err.message : String(err) },
        "tick.row-failed",
      );
    }
  }

  // Reset streaks for tasks that just went overdue (window closed without completion)
  if (newlyOverdueTasks.length > 0) {
    try {
      const overdueIds = newlyOverdueTasks.map((t) => t.id);
      const affectedStreaks = db
        .select()
        .from(schema.streaks)
        .where(
          and(inArray(schema.streaks.task_id, overdueIds), gt(schema.streaks.current_length, 0)),
        )
        .all();

      const toReset = detectBrokenStreaks(newlyOverdueTasks, affectedStreaks);

      for (const streak of toReset) {
        try {
          db.update(schema.streaks)
            .set({ current_length: 0 })
            .where(
              and(
                eq(schema.streaks.task_id, streak.task_id),
                eq(schema.streaks.user_id, streak.user_id),
              ),
            )
            .run();
          logger.info({ task: streak.task_id, user: streak.user_id }, "tick.streak-reset");
        } catch (err) {
          logger.error(
            {
              task: streak.task_id,
              user: streak.user_id,
              err: err instanceof Error ? err.message : String(err),
            },
            "tick.streak-reset-failed",
          );
        }
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "tick.streak-phase-failed",
      );
    }
  }

  return updated;
}
