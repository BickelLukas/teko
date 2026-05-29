ALTER TABLE `users` ADD `notification_service` text;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_digest_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_digest_sent_date` text;