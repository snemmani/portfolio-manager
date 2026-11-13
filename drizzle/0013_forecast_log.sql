CREATE TABLE IF NOT EXISTS `forecast_log` (
	`ticker` text NOT NULL,
	`recorded_at` text NOT NULL,
	`policy` text NOT NULL,
	`currency` text NOT NULL,
	`price_at` real NOT NULL,
	`year5_target` real NOT NULL,
	`year5_bear` real,
	`dividend_per_share` real,
	`hurdle` real NOT NULL,
	`passed` integer NOT NULL,
	`data_json` text NOT NULL,
	PRIMARY KEY(`ticker`, `recorded_at`)
);
