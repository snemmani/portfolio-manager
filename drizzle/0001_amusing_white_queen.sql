CREATE TABLE `research_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`input_json` text,
	`result_json` text,
	`snapshot_at` text,
	`lease_token` text,
	`lease_until` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runner_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`auth_mode` text,
	`machine` text,
	`heartbeat_at` text,
	`last_error` text,
	`last_completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reports` ADD `provider` text DEFAULT 'legacy-api' NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `recommendations_json` text;