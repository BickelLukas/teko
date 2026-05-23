import { and, isNull, isNotNull, ne } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { computeTaskState } from "../domain/recurrence.js";

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

  for (const task of tasks) {
    const computed = computeTaskState(task, now);

    // archived derived from archived_at; done = one-off completion — neither stored as state
    if (computed === "archived" || computed === "done") continue;

    if (task.state === computed) continue;

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

  return updated;
}
