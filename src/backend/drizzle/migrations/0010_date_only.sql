-- ADR-0009: store task dates as ISO 8601 date strings (YYYY-MM-DD), not datetimes,
-- and drop the unused `is_household` column (leftover from an old concept).
--
-- The drizzle-kit snapshot lineage predates the hand-authored 0007-0009 migrations,
-- so the auto-generated SQL could not be used verbatim (it tried to redo earlier
-- migrations). The journal entry and meta/0010_snapshot.json ARE tool-generated and
-- reflect the true current schema; this SQL body is the real delta against the
-- post-0009 database.
--
-- Date conversion note: NAIVE UTC date extraction. Each integer (Unix ms) timestamp
-- is divided by 1000 to seconds, then strftime takes the UTC date part. This is NOT
-- timezone-aware — it uses the UTC date of the stored moment. Spot-check tasks stored
-- near a UTC midnight boundary after running this migration.
--
-- Columns migrated to TEXT 'YYYY-MM-DD':
--   tasks.due_at, completions.cycle_due_at
-- Column dropped:
--   tasks.is_household
-- Left as datetime (moments, not dates): created_at, archived_at, completed_at, etc.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- ── tasks: due_at integer→text, drop is_household ─────────────────────────────
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assignee_id` text,
	`state` text DEFAULT 'eligible' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`archived_at` integer,
	`recurrence_rule` text,
	`recurrence_mode` text,
	`completion_window_days` integer,
	`due_at` text,
	`points` integer,
	`exposed_to_ha` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_tasks`(
	"id", "title", "description", "assignee_id", "state", "created_at", "created_by",
	"archived_at", "recurrence_rule", "recurrence_mode", "completion_window_days",
	"due_at", "points", "exposed_to_ha"
)
SELECT
	"id", "title", "description", "assignee_id", "state", "created_at", "created_by",
	"archived_at", "recurrence_rule", "recurrence_mode", "completion_window_days",
	CASE WHEN "due_at" IS NULL THEN NULL
	     ELSE strftime('%Y-%m-%d', CAST("due_at" AS INTEGER) / 1000, 'unixepoch')
	END,
	"points", "exposed_to_ha"
FROM `tasks`;
--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint

-- ── completions: cycle_due_at integer→text ────────────────────────────────────
CREATE TABLE `__new_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`completed_by` text NOT NULL,
	`completed_at` integer NOT NULL,
	`was_on_time` integer,
	`points_awarded` integer,
	`cycle_due_at` text,
	`notes` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_completions`(
	"id", "task_id", "completed_by", "completed_at",
	"was_on_time", "points_awarded", "cycle_due_at", "notes"
)
SELECT
	"id", "task_id", "completed_by", "completed_at",
	"was_on_time", "points_awarded",
	CASE WHEN "cycle_due_at" IS NULL THEN NULL
	     ELSE strftime('%Y-%m-%d', CAST("cycle_due_at" AS INTEGER) / 1000, 'unixepoch')
	END,
	"notes"
FROM `completions`;
--> statement-breakpoint
DROP TABLE `completions`;--> statement-breakpoint
ALTER TABLE `__new_completions` RENAME TO `completions`;--> statement-breakpoint

PRAGMA foreign_keys=ON;
