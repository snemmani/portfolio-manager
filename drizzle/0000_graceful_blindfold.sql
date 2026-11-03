CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`response_id` text,
	`body` text,
	`error` text,
	`as_of` text NOT NULL,
	`model` text NOT NULL,
	`snapshot_hash` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`encrypted_key` text,
	`enabled` integer DEFAULT 0 NOT NULL,
	`interval_minutes` integer DEFAULT 60 NOT NULL,
	`updated_at` text NOT NULL
);
