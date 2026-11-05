CREATE TABLE IF NOT EXISTS `alert_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook` text,
	`enabled` integer DEFAULT 0,
	`heartbeat` text,
	`error` text,
	`auto_arm` integer DEFAULT 1,
	`scanned` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `price_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text,
	`portfolio` text,
	`intent` text,
	`budget` text,
	`side` text,
	`target` real,
	`currency` text,
	`expires` text,
	`status` text,
	`created` text,
	`delivered` text,
	`error` text
);
