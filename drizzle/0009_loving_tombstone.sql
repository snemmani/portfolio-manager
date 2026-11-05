CREATE TABLE `market_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`phase` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`snapshot_json` text,
	`frame_json` text,
	`guard_revision` text,
	`busy_token` text,
	`busy_until` text,
	`busy_operation` text,
	`scope_json` text,
	`events_hash` text,
	`discovery_hash` text,
	`completed_lease` text,
	`completed_at` text,
	`error` text
);
--> statement-breakpoint
ALTER TABLE `market_state` ADD `review_id` text;--> statement-breakpoint
ALTER TABLE `market_state` ADD `claim_id` text;