-- ADR-0007: collapse next_due_at + planned_for into a single due_at column.
-- Data migration: preserve all scheduled dates, migrate 'planned' state to 'eligible'.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`due_at` integer,
	`points` integer,
	`tags` text,
	`exposed_to_ha` integer DEFAULT false NOT NULL,
	`is_household` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "title", "description", "assignee_id", "state", "created_at", "created_by", "archived_at", "recurrence_rule", "recurrence_mode", "completion_window_days", "due_at", "points", "tags", "exposed_to_ha", "is_household") SELECT "id", "title", "description", "assignee_id", CASE WHEN "state" = 'planned' THEN 'eligible' ELSE "state" END, "created_at", "created_by", "archived_at", "recurrence_rule", "recurrence_mode", "completion_window_days", COALESCE("next_due_at", "planned_for"), "points", "tags", "exposed_to_ha", "is_household" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
