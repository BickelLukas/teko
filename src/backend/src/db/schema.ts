import { integer, text, sqliteTable, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { getNow } from "../domain/clock.js";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  ha_user_id: text("ha_user_id").unique().notNull(),
  name: text("name").notNull(),
  display_name: text("display_name"),
  locale: text("locale").notNull().default("en"),
  theme: text("theme", { enum: ["light", "dark", "system"] })
    .notNull()
    .default("system"),
  notification_time: text("notification_time"),
  // HA notify service id, e.g. "notify.mobile_app_alices_phone".
  // Null = notifications disabled for this user.
  notification_service: text("notification_service"),
  notify_digest_enabled: integer("notify_digest_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  // Local calendar date (YYYY-MM-DD, household timezone) the most recent digest
  // was considered for this user. Drives idempotency for the daily digest job.
  last_digest_sent_date: text("last_digest_sent_date"),
  notify_evening_reminder_enabled: integer("notify_evening_reminder_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  // HH:MM time for the evening reminder. Null = use default of "19:00".
  evening_reminder_time: text("evening_reminder_time"),
  // Local calendar date (YYYY-MM-DD, household timezone) the most recent evening
  // reminder was considered for this user. Drives idempotency for the job.
  last_evening_reminder_sent_date: text("last_evening_reminder_sent_date"),
  // Reserved. Always false in v0.x. See ADR-0005.
  is_admin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
  week_start_day: integer("week_start_day").notNull().default(1),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => getNow()),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignee_id: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  state: text("state", {
    enum: ["not_yet", "eligible", "overdue", "done"],
  })
    .notNull()
    .default("eligible"),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => getNow()),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  archived_at: integer("archived_at", { mode: "timestamp_ms" }),
  recurrence_rule: text("recurrence_rule"),
  recurrence_mode: text("recurrence_mode", {
    enum: ["fixed", "after_completion"],
  }),
  completion_window_days: integer("completion_window_days"),
  due_at: text("due_at"),
  points: integer("points"),
  exposed_to_ha: integer("exposed_to_ha", { mode: "boolean" }).notNull().default(false),
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
  cycle_due_at: text("cycle_due_at"),
  notes: text("notes"),
});

export const devSettings = sqliteTable("dev_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => getNow()),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
});

// Long-lived bearer tokens used by the HA integration to authenticate against
// the add-on (Phase 11). Represents the integration acting on behalf of the
// household, not a specific user — see ADR/ARCHITECTURE "HA Integration Surface".
// Only the SHA-256 hash is stored; the raw token is shown once at creation time.
export const integrationTokens = sqliteTable("integration_tokens", {
  id: text("id").primaryKey(),
  token_hash: text("token_hash").unique().notNull(),
  label: text("label").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => getNow()),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
  revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
});

export const task_tags = sqliteTable(
  "task_tags",
  {
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tag_id: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => getNow()),
  },
  (table) => [primaryKey({ columns: [table.task_id, table.tag_id] })],
);
