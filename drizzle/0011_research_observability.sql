CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`phase` text NOT NULL,
	`request_source` text NOT NULL,
	`focus_ticker` text,
	`scope_json` text DEFAULT '[]' NOT NULL,
	`events_json` text DEFAULT '[]' NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`document_reads` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`updated_at` text NOT NULL,
	`heartbeat_at` text,
	`finished_at` text,
	`error` text
);
--> statement-breakpoint
ALTER TABLE `research_jobs` ADD `run_id` text;