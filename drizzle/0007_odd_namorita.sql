CREATE TABLE IF NOT EXISTS `trade_reviews` (
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trade_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`updated_at` text NOT NULL
);
