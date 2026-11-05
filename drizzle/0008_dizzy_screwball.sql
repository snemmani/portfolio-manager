CREATE TABLE IF NOT EXISTS `discovery_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle` text NOT NULL,
	`ticker` text NOT NULL,
	`data_json` text NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_candidates_cycle ON discovery_candidates(cycle);
--> statement-breakpoint
UPDATE market_state SET requested=1 WHERE id='local';
