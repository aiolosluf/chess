ALTER TABLE `puzzles` ADD COLUMN `previous_move_san` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `puzzles` ADD COLUMN `previous_move_uci` text DEFAULT '' NOT NULL;
