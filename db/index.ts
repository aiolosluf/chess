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
      dedupe_key TEXT NOT NULL DEFAULT '',
      game_pgn TEXT NOT NULL DEFAULT '',
      game_headers TEXT NOT NULL DEFAULT '',
      game_title TEXT NOT NULL,
      white TEXT NOT NULL,
      black TEXT NOT NULL,
      event TEXT NOT NULL,
      played_at TEXT NOT NULL,
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

  if (migrations.length) {
    await db.batch(migrations);
  }

  await db
    .prepare("CREATE INDEX IF NOT EXISTS puzzles_dedupe_key_idx ON puzzles (dedupe_key)")
    .run();
}
