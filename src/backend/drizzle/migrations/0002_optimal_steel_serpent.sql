CREATE TABLE `streaks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`current_length` integer DEFAULT 0 NOT NULL,
	`longest_length` integer DEFAULT 0 NOT NULL,
	`last_completed_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streaks_task_user_idx` ON `streaks` (`task_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `week_start_day` integer DEFAULT 1 NOT NULL;