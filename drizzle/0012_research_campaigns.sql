CREATE TABLE `research_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio` text NOT NULL,
	`market` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`work_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_scheduled_at` text
);
