ALTER TABLE `puzzles` ADD COLUMN `dedupe_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `puzzles` ADD COLUMN `game_pgn` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `puzzles` ADD COLUMN `game_headers` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `puzzles_dedupe_key_idx` ON `puzzles` (`dedupe_key`);
