import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function getPuzzleD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` before using the puzzle database."
    );
  }

  await ensurePuzzleSchema(env.DB);
  return env.DB;
}

async function ensurePuzzleSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source_name TEXT NOT NULL,
      source_platform TEXT NOT NULL DEFAULT 'pgn',
      source_username TEXT NOT NULL DEFAULT '',
      source_game_id INTEGER,
      dedupe_key TEXT NOT NULL DEFAULT '',
      game_pgn TEXT NOT NULL DEFAULT '',
      game_headers TEXT NOT NULL DEFAULT '',
      game_title TEXT NOT NULL,
      white TEXT NOT NULL,
      black TEXT NOT NULL,
      event TEXT NOT NULL,
      played_at TEXT NOT NULL,
      time_class TEXT NOT NULL DEFAULT '',
      opening_name TEXT NOT NULL DEFAULT '',
      eco TEXT NOT NULL DEFAULT '',
      move_number INTEGER NOT NULL,
      ply INTEGER NOT NULL,
      side TEXT NOT NULL,
      previous_move_san TEXT NOT NULL DEFAULT '',
      previous_move_uci TEXT NOT NULL DEFAULT '',
      fen_before TEXT NOT NULL,
      fen_after TEXT NOT NULL,
      played_move_san TEXT NOT NULL,
      played_move_uci TEXT NOT NULL,
      best_move_san TEXT NOT NULL,
      best_move_uci TEXT NOT NULL,
      loss_cp INTEGER NOT NULL,
      severity TEXT NOT NULL,
      analysis_depth INTEGER NOT NULL DEFAULT 18,
      attempts INTEGER NOT NULL DEFAULT 0,
      solves INTEGER NOT NULL DEFAULT 0,
      last_practiced_at TEXT
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS puzzles_created_at_idx ON puzzles (created_at)"
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS puzzles_severity_idx ON puzzles (severity)"
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS puzzles_dedupe_key_idx ON puzzles (dedupe_key)"
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS games (
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
      opening_name TEXT NOT NULL DEFAULT '',
      eco TEXT NOT NULL DEFAULT '',
      analysis_depth INTEGER NOT NULL DEFAULT 18,
      puzzle_generated_at TEXT
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS games_source_idx ON games (source_platform, source_username)"
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS games_game_key_idx ON games (game_key)"
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS games_puzzle_generated_idx ON games (puzzle_generated_at)"
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY,
      chesscom_username TEXT NOT NULL DEFAULT '',
      lichess_username TEXT NOT NULL DEFAULT '',
      fide_id TEXT NOT NULL DEFAULT '',
      fide_name TEXT NOT NULL DEFAULT '',
      analysis_depth INTEGER NOT NULL DEFAULT 18,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS practice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puzzle_id INTEGER NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      improvement_cp INTEGER NOT NULL DEFAULT 0,
      is_first_attempt INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS practice_events_created_idx ON practice_events (created_at)"
    ),
  ]);

  const columns = await db.prepare("PRAGMA table_info(puzzles)").all();
  const columnNames = new Set(
    (columns.results ?? []).map((column) => String(column.name))
  );
  const migrations = [];

  if (!columnNames.has("previous_move_san")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN previous_move_san TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("previous_move_uci")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN previous_move_uci TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("dedupe_key")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("game_pgn")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN game_pgn TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("game_headers")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN game_headers TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("source_platform")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN source_platform TEXT NOT NULL DEFAULT 'pgn'")
    );
  }

  if (!columnNames.has("source_username")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN source_username TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("source_game_id")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN source_game_id INTEGER")
    );
  }

  if (!columnNames.has("time_class")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN time_class TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("analysis_depth")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN analysis_depth INTEGER NOT NULL DEFAULT 18")
    );
  }

  if (!columnNames.has("opening_name")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN opening_name TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!columnNames.has("eco")) {
    migrations.push(
      db.prepare("ALTER TABLE puzzles ADD COLUMN eco TEXT NOT NULL DEFAULT ''")
    );
  }

  if (migrations.length) {
    await db.batch(migrations);
  }

  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_dedupe_key_idx ON puzzles (dedupe_key)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_source_game_idx ON puzzles (source_game_id)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_played_at_idx ON puzzles (played_at)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_time_class_idx ON puzzles (time_class)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_side_idx ON puzzles (side)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_opening_idx ON puzzles (opening_name, eco)")
    .run();

  const settingsColumns = await db.prepare("PRAGMA table_info(user_settings)").all();
  const settingsNames = new Set(
    (settingsColumns.results ?? []).map((column) => String(column.name))
  );
  const settingsMigrations = [];

  if (!settingsNames.has("fide_id")) {
    settingsMigrations.push(
      db.prepare("ALTER TABLE user_settings ADD COLUMN fide_id TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!settingsNames.has("fide_name")) {
    settingsMigrations.push(
      db.prepare("ALTER TABLE user_settings ADD COLUMN fide_name TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!settingsNames.has("analysis_depth")) {
    settingsMigrations.push(
      db.prepare("ALTER TABLE user_settings ADD COLUMN analysis_depth INTEGER NOT NULL DEFAULT 18")
    );
  }

  if (settingsMigrations.length) {
    await db.batch(settingsMigrations);
  }

  const practiceColumns = await db.prepare("PRAGMA table_info(practice_events)").all();
  const practiceNames = new Set(
    (practiceColumns.results ?? []).map((column) => String(column.name))
  );
  const practiceMigrations = [];

  if (!practiceNames.has("improvement_cp")) {
    practiceMigrations.push(
      db.prepare("ALTER TABLE practice_events ADD COLUMN improvement_cp INTEGER NOT NULL DEFAULT 0")
    );
  }

  if (!practiceNames.has("is_first_attempt")) {
    practiceMigrations.push(
      db.prepare("ALTER TABLE practice_events ADD COLUMN is_first_attempt INTEGER NOT NULL DEFAULT 0")
    );
  }

  if (practiceMigrations.length) {
    await db.batch(practiceMigrations);
  }

  const gameColumns = await db.prepare("PRAGMA table_info(games)").all();
  const gameNames = new Set(
    (gameColumns.results ?? []).map((column) => String(column.name))
  );
  const gameMigrations = [];

  if (!gameNames.has("analysis_depth")) {
    gameMigrations.push(
      db.prepare("ALTER TABLE games ADD COLUMN analysis_depth INTEGER NOT NULL DEFAULT 18")
    );
  }

  if (!gameNames.has("opening_name")) {
    gameMigrations.push(
      db.prepare("ALTER TABLE games ADD COLUMN opening_name TEXT NOT NULL DEFAULT ''")
    );
  }

  if (!gameNames.has("eco")) {
    gameMigrations.push(
      db.prepare("ALTER TABLE games ADD COLUMN eco TEXT NOT NULL DEFAULT ''")
    );
  }

  if (gameMigrations.length) {
    await db.batch(gameMigrations);
  }

  await db
    .prepare("CREATE INDEX IF NOT EXISTS games_opening_idx ON games (opening_name, eco)")
    .run();
  await db
    .prepare(
      `UPDATE games
      SET
        opening_name = COALESCE(json_extract(game_headers, '$.Opening'), ''),
        eco = COALESCE(json_extract(game_headers, '$.ECO'), '')
      WHERE opening_name = ''
        AND game_headers <> ''`
    )
    .run();
  await db
    .prepare(
      `UPDATE puzzles
      SET
        opening_name = COALESCE(json_extract(game_headers, '$.Opening'), ''),
        eco = COALESCE(json_extract(game_headers, '$.ECO'), '')
      WHERE opening_name = ''
        AND game_headers <> ''`
    )
    .run();
}

