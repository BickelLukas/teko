CREATE TABLE `tags` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `color` text NOT NULL,
  `created_at` integer NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_lower_idx` ON `tags` (LOWER(`name`));--> statement-breakpoint
CREATE TABLE `task_tags` (
  `task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  `tag_id` integer NOT NULL REFERENCES `tags`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`task_id`, `tag_id`)
);--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `tags`;
