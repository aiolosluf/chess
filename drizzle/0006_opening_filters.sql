ALTER TABLE games ADD COLUMN opening_name TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN eco TEXT NOT NULL DEFAULT '';
ALTER TABLE puzzles ADD COLUMN opening_name TEXT NOT NULL DEFAULT '';
ALTER TABLE puzzles ADD COLUMN eco TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS games_opening_idx ON games (opening_name, eco);
CREATE INDEX IF NOT EXISTS puzzles_opening_idx ON puzzles (opening_name, eco);
CREATE INDEX IF NOT EXISTS puzzles_side_idx ON puzzles (side);
