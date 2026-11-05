CREATE TABLE IF NOT EXISTS `buy_review_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`completed_at` text NOT NULL,
	`status` text NOT NULL,
	`lease_until` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qualifying_buy_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`portfolio` text NOT NULL,
	`ticker` text NOT NULL,
	`quantity` real NOT NULL,
	`limit_price` real NOT NULL,
	`currency` text NOT NULL,
	`reason` text NOT NULL,
	`risk` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`delivered_at` text,
	`error` text,
	`next_attempt` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qualifying_buy_state` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio` text NOT NULL,
	`ticker` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `alert_settings` ADD `new_buys` integer DEFAULT 1;