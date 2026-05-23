import { and, isNull, isNotNull, ne, inArray, gt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { computeTaskState } from "../domain/recurrence.js";
import { detectBrokenStreaks } from "../domain/streaks.js";

export async function runTick(db: Db, now: Date = new Date()): Promise<number> {
  const tasks = db
    .select()
    .from(schema.tasks)
    .where(
      and(
        isNull(schema.tasks.archived_at),
        ne(schema.tasks.state, "done"),
        isNotNull(schema.tasks.next_due_at),
      ),
    )
    .all();

  let updated = 0;
  const newlyOverdueTasks: (typeof schema.tasks.$inferSelect)[] = [];

  for (const task of tasks) {
    const computed = computeTaskState(task, now);

    // archived derived from archived_at; done = one-off completion — neither stored as state
    if (computed === "archived" || computed === "done") continue;

    if (task.state === computed) continue;

    if (computed === "overdue" && task.state !== "overdue") {
      newlyOverdueTasks.push(task);
    }

    const updates: {
      state: "not_yet" | "eligible" | "planned" | "overdue" | "done";
      planned_for?: Date | null;
    } = { state: computed };

    // clear planned_for if the planned date has passed and state is no longer planned
    if (task.planned_for !== null && computed !== "planned") {
      updates.planned_for = null;
    }

    db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, task.id)).run();

    console.log(`tick: ${task.id} (${task.title}) ${task.state} → ${computed}`);
    updated++;
  }

  // Reset streaks for tasks that just went overdue (window closed without completion)
  if (newlyOverdueTasks.length > 0) {
    const overdueIds = newlyOverdueTasks.map((t) => t.id);
    const affectedStreaks = db
      .select()
      .from(schema.streaks)
      .where(and(inArray(schema.streaks.task_id, overdueIds), gt(schema.streaks.current_length, 0)))
      .all();

    const toReset = detectBrokenStreaks(newlyOverdueTasks, affectedStreaks);

    for (const streak of toReset) {
      db.update(schema.streaks)
        .set({ current_length: 0 })
        .where(
          and(
            eq(schema.streaks.task_id, streak.task_id),
            eq(schema.streaks.user_id, streak.user_id),
          ),
        )
        .run();
      console.log(`streak-reset: task=${streak.task_id} user=${streak.user_id} (overdue)`);
    }
  }

  return updated;
}
