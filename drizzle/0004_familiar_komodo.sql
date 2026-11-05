ALTER TABLE `research_jobs` ADD `request_source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_jobs` ADD `last_auto_slot` text;
--> statement-breakpoint
UPDATE settings SET interval_minutes=60;
