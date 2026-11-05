CREATE TABLE `fundamental_reviews` (
	`ticker` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`researched_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `research_jobs` ADD `focus_ticker` text;