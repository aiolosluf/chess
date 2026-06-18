import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const puzzles = sqliteTable(
  "puzzles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sourceName: text("source_name").notNull(),
    sourcePlatform: text("source_platform").notNull().default("pgn"),
    sourceUsername: text("source_username").notNull().default(""),
    sourceGameId: integer("source_game_id"),
    dedupeKey: text("dedupe_key").notNull().default(""),
    gamePgn: text("game_pgn").notNull().default(""),
    gameHeaders: text("game_headers").notNull().default(""),
    gameTitle: text("game_title").notNull(),
    white: text("white").notNull(),
    black: text("black").notNull(),
    event: text("event").notNull(),
    playedAt: text("played_at").notNull(),
    moveNumber: integer("move_number").notNull(),
    ply: integer("ply").notNull(),
    side: text("side").notNull(),
    previousMoveSan: text("previous_move_san").notNull().default(""),
    previousMoveUci: text("previous_move_uci").notNull().default(""),
    fenBefore: text("fen_before").notNull(),
    fenAfter: text("fen_after").notNull(),
    playedMoveSan: text("played_move_san").notNull(),
    playedMoveUci: text("played_move_uci").notNull(),
    bestMoveSan: text("best_move_san").notNull(),
    bestMoveUci: text("best_move_uci").notNull(),
    lossCp: integer("loss_cp").notNull(),
    severity: text("severity").notNull(),
    attempts: integer("attempts").notNull().default(0),
    solves: integer("solves").notNull().default(0),
    lastPracticedAt: text("last_practiced_at"),
  },
  (table) => [
    index("puzzles_created_at_idx").on(table.createdAt),
    index("puzzles_severity_idx").on(table.severity),
    index("puzzles_dedupe_key_idx").on(table.dedupeKey),
    index("puzzles_source_game_idx").on(table.sourceGameId),
  ]
);

export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sourcePlatform: text("source_platform").notNull(),
    sourceUsername: text("source_username").notNull(),
    sourceUrl: text("source_url").notNull().default(""),
    gameKey: text("game_key").notNull(),
    pgn: text("pgn").notNull(),
    gameHeaders: text("game_headers").notNull().default(""),
    gameTitle: text("game_title").notNull(),
    white: text("white").notNull(),
    black: text("black").notNull(),
    event: text("event").notNull(),
    playedAt: text("played_at").notNull(),
    userSide: text("user_side").notNull(),
    timeClass: text("time_class").notNull().default(""),
    puzzleGeneratedAt: text("puzzle_generated_at"),
  },
  (table) => [
    index("games_source_idx").on(table.sourcePlatform, table.sourceUsername),
    index("games_game_key_idx").on(table.gameKey),
    index("games_puzzle_generated_idx").on(table.puzzleGeneratedAt),
  ]
);

export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey(),
  chessComUsername: text("chesscom_username").notNull().default(""),
  lichessUsername: text("lichess_username").notNull().default(""),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
