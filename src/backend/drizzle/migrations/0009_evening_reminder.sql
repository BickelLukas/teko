ALTER TABLE `users` ADD `notify_evening_reminder_enabled` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` ADD `evening_reminder_time` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_evening_reminder_sent_date` text;
