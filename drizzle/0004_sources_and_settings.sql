ALTER TABLE puzzles ADD COLUMN source_platform TEXT NOT NULL DEFAULT 'pgn';
ALTER TABLE puzzles ADD COLUMN source_username TEXT NOT NULL DEFAULT '';
ALTER TABLE puzzles ADD COLUMN source_game_id INTEGER;
ALTER TABLE puzzles ADD COLUMN time_class TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS puzzles_source_game_idx ON puzzles (source_game_id);
CREATE INDEX IF NOT EXISTS puzzles_played_at_idx ON puzzles (played_at);
CREATE INDEX IF NOT EXISTS puzzles_time_class_idx ON puzzles (time_class);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_platform TEXT NOT NULL,
  source_username TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  game_key TEXT NOT NULL,
  pgn TEXT NOT NULL,
  game_headers TEXT NOT NULL DEFAULT '',
  game_title TEXT NOT NULL,
  white TEXT NOT NULL,
  black TEXT NOT NULL,
  event TEXT NOT NULL,
  played_at TEXT NOT NULL,
  user_side TEXT NOT NULL,
  time_class TEXT NOT NULL DEFAULT '',
  puzzle_generated_at TEXT
);

CREATE INDEX IF NOT EXISTS games_source_idx ON games (source_platform, source_username);
CREATE INDEX IF NOT EXISTS games_game_key_idx ON games (game_key);
CREATE INDEX IF NOT EXISTS games_puzzle_generated_idx ON games (puzzle_generated_at);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY,
  chesscom_username TEXT NOT NULL DEFAULT '',
  lichess_username TEXT NOT NULL DEFAULT '',
  fide_id TEXT NOT NULL DEFAULT '',
  fide_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS practice_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id INTEGER NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS practice_events_created_idx ON practice_events (created_at);
