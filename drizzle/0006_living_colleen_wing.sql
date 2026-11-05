CREATE TABLE IF NOT EXISTS `event_acknowledgements` (
	`ticker` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_state` (
	`id` text PRIMARY KEY NOT NULL,
	`discovery_json` text,
	`events_json` text,
	`plans_json` text,
	`last_checked` text,
	`last_slot` text,
	`lease_token` text,
	`lease_until` text,
	`requested` integer DEFAULT 1 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rule_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`updated_at` text NOT NULL,
	`recommendations_json` text NOT NULL,
	`provider` text DEFAULT 'rules' NOT NULL
);

--> statement-breakpoint
UPDATE settings SET interval_minutes=120;
--> statement-breakpoint
INSERT OR IGNORE INTO market_state(id,requested) VALUES('local',1);
