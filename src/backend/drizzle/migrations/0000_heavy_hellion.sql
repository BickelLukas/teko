CREATE TABLE `completions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`completed_by` text NOT NULL,
	`completed_at` integer NOT NULL,
	`was_on_time` integer,
	`points_awarded` integer,
	`cycle_due_at` integer,
	`notes` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assignee_id` text,
	`parent_id` text,
	`state` text DEFAULT 'eligible' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`archived_at` integer,
	`recurrence_rule` text,
	`recurrence_mode` text,
	`completion_window_days` integer,
	`next_due_at` integer,
	`planned_for` integer,
	`points` integer,
	`tags` text,
	`exposed_to_ha` integer DEFAULT false NOT NULL,
	`is_household` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`ha_user_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`notification_time` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_ha_user_id_unique` ON `users` (`ha_user_id`);