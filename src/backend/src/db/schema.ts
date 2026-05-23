import { integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  ha_user_id: text("ha_user_id").unique().notNull(),
  name: text("name").notNull(),
  display_name: text("display_name"),
  locale: text("locale").notNull().default("en"),
  notification_time: text("notification_time"),
  is_admin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
  week_start_day: integer("week_start_day").notNull().default(1),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignee_id: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  parent_id: text("parent_id").references((): AnySQLiteColumn => tasks.id, {
    onDelete: "set null",
  }),
  state: text("state", {
    enum: ["not_yet", "eligible", "planned", "overdue", "done"],
  })
    .notNull()
    .default("eligible"),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  archived_at: integer("archived_at", { mode: "timestamp_ms" }),
  recurrence_rule: text("recurrence_rule"),
  recurrence_mode: text("recurrence_mode", {
    enum: ["fixed", "after_completion"],
  }),
  completion_window_days: integer("completion_window_days"),
  next_due_at: integer("next_due_at", { mode: "timestamp_ms" }),
  planned_for: integer("planned_for", { mode: "timestamp_ms" }),
  points: integer("points"),
  tags: text("tags"),
  exposed_to_ha: integer("exposed_to_ha", { mode: "boolean" }).notNull().default(false),
  is_household: integer("is_household", { mode: "boolean" }).notNull().default(false),
  auto_complete_when_children_done: integer("auto_complete_when_children_done", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
});

export const streaks = sqliteTable(
  "streaks",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    current_length: integer("current_length").notNull().default(0),
    longest_length: integer("longest_length").notNull().default(0),
    last_completed_at: integer("last_completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [uniqueIndex("streaks_task_user_idx").on(table.task_id, table.user_id)],
);

export const completions = sqliteTable("completions", {
  id: text("id").primaryKey(),
  task_id: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  completed_by: text("completed_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  completed_at: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  was_on_time: integer("was_on_time", { mode: "boolean" }),
  points_awarded: integer("points_awarded"),
  cycle_due_at: integer("cycle_due_at", { mode: "timestamp_ms" }),
  notes: text("notes"),
});
