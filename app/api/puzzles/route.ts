import { getPuzzleD1 } from "@/db";

const PUZZLE_API_SCHEMA_VERSION = 3;

type IncomingPuzzle = {
  dedupeKey?: string;
  sourceName?: string;
  sourcePlatform?: string;
  sourceUsername?: string;
  sourceGameId?: number | null;
  gamePgn?: string;
  gameHeaders?: string;
  gameTitle?: string;
  white?: string;
  black?: string;
  event?: string;
  playedAt?: string;
  moveNumber?: number;
  ply?: number;
  side?: string;
  previousMoveSan?: string;
  previousMoveUci?: string;
  fenBefore?: string;
  fenAfter?: string;
  playedMoveSan?: string;
  playedMoveUci?: string;
  bestMoveSan?: string;
  bestMoveUci?: string;
  lossCp?: number;
  severity?: string;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function ensureExtendedPuzzleColumns(db: D1Database) {
  const columns = await db.prepare("PRAGMA table_info(puzzles)").all();
  const names = new Set((columns.results ?? []).map((column) => String(column.name)));
  const migrations = [];

  if (!names.has("dedupe_key")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''"));
  }
  if (!names.has("game_pgn")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN game_pgn TEXT NOT NULL DEFAULT ''"));
  }
  if (!names.has("game_headers")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN game_headers TEXT NOT NULL DEFAULT ''"));
  }
  if (!names.has("previous_move_san")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN previous_move_san TEXT NOT NULL DEFAULT ''"));
  }
  if (!names.has("previous_move_uci")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN previous_move_uci TEXT NOT NULL DEFAULT ''"));
  }
  if (!names.has("source_platform")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN source_platform TEXT NOT NULL DEFAULT 'pgn'"));
  }
  if (!names.has("source_username")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN source_username TEXT NOT NULL DEFAULT ''"));
  }
  if (!names.has("source_game_id")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN source_game_id INTEGER"));
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
}

function normalizePuzzle(puzzle: IncomingPuzzle) {
  const normalized = {
    dedupeKey: cleanText(puzzle.dedupeKey),
    sourceName: cleanText(puzzle.sourceName, "PGN"),
    sourcePlatform: cleanText(puzzle.sourcePlatform, "pgn").toLowerCase(),
    sourceUsername: cleanText(puzzle.sourceUsername),
    sourceGameId:
      puzzle.sourceGameId === null || puzzle.sourceGameId === undefined
        ? null
        : Number(puzzle.sourceGameId),
    gamePgn: cleanText(puzzle.gamePgn),
    gameHeaders: cleanText(puzzle.gameHeaders),
    gameTitle: cleanText(puzzle.gameTitle, "棋局"),
    white: cleanText(puzzle.white, "White"),
    black: cleanText(puzzle.black, "Black"),
    event: cleanText(puzzle.event, "Training"),
    playedAt: cleanText(puzzle.playedAt, ""),
    moveNumber: Number(puzzle.moveNumber),
    ply: Number(puzzle.ply),
    side: cleanText(puzzle.side),
    previousMoveSan: cleanText(puzzle.previousMoveSan),
    previousMoveUci: cleanText(puzzle.previousMoveUci),
    fenBefore: cleanText(puzzle.fenBefore),
    fenAfter: cleanText(puzzle.fenAfter),
    playedMoveSan: cleanText(puzzle.playedMoveSan),
    playedMoveUci: cleanText(puzzle.playedMoveUci),
    bestMoveSan: cleanText(puzzle.bestMoveSan),
    bestMoveUci: cleanText(puzzle.bestMoveUci),
    lossCp: Math.round(Number(puzzle.lossCp)),
    severity: cleanText(puzzle.severity),
  };

  normalized.dedupeKey ||= `${normalized.fenBefore}|${normalized.bestMoveUci}`;

  if (
    !normalized.fenBefore ||
    !normalized.fenAfter ||
    !normalized.playedMoveUci ||
    !normalized.bestMoveUci ||
    !Number.isFinite(normalized.moveNumber) ||
    !Number.isFinite(normalized.ply) ||
    !Number.isFinite(normalized.lossCp)
  ) {
    return null;
  }

  return normalized;
}

export async function GET() {
  try {
    void PUZZLE_API_SCHEMA_VERSION;
    const db = await getPuzzleD1();
    await ensureExtendedPuzzleColumns(db);
    const puzzles = await db
      .prepare(
        `SELECT
          id,
          created_at AS createdAt,
          source_name AS sourceName,
          source_platform AS sourcePlatform,
          source_username AS sourceUsername,
          source_game_id AS sourceGameId,
          dedupe_key AS dedupeKey,
          game_pgn AS gamePgn,
          game_headers AS gameHeaders,
          game_title AS gameTitle,
          white,
          black,
          event,
          played_at AS playedAt,
          move_number AS moveNumber,
          ply,
          side,
          previous_move_san AS previousMoveSan,
          previous_move_uci AS previousMoveUci,
          fen_before AS fenBefore,
          fen_after AS fenAfter,
          played_move_san AS playedMoveSan,
          played_move_uci AS playedMoveUci,
          best_move_san AS bestMoveSan,
          best_move_uci AS bestMoveUci,
          loss_cp AS lossCp,
          severity,
          attempts,
          solves,
          last_practiced_at AS lastPracticedAt
        FROM puzzles
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 100`
      )
      .all();

    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(attempts), 0) AS attempts,
          COALESCE(SUM(solves), 0) AS solves,
          COALESCE(ROUND(AVG(loss_cp)), 0) AS averageLoss
        FROM puzzles`
      )
      .first();

    return Response.json({
      puzzles: puzzles.results ?? [],
      stats: stats ?? { total: 0, attempts: 0, solves: 0, averageLoss: 0 },
    });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { puzzles?: IncomingPuzzle[] };
    const puzzles = Array.isArray(payload.puzzles)
      ? payload.puzzles.map(normalizePuzzle).filter((item) => item !== null)
      : [];

    if (!puzzles.length) {
      return Response.json({ error: "没有可保存的题目" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    await ensureExtendedPuzzleColumns(db);
    const existing = await db
      .prepare(
        `SELECT dedupe_key AS dedupeKey
        FROM puzzles
        WHERE dedupe_key IN (${puzzles.map(() => "?").join(",")})`
      )
      .bind(...puzzles.map((puzzle) => puzzle.dedupeKey))
      .all();
    const existingKeys = new Set(
      (existing.results ?? []).map((row) => String(row.dedupeKey))
    );
    const uniquePuzzles = puzzles.filter(
      (puzzle, index, all) =>
        !existingKeys.has(puzzle.dedupeKey) &&
        all.findIndex((item) => item.dedupeKey === puzzle.dedupeKey) === index
    );

    if (!uniquePuzzles.length) {
      return Response.json({ saved: 0, skipped: puzzles.length });
    }

    const insert = db.prepare(
      `INSERT INTO puzzles (
        source_name,
        source_platform,
        source_username,
        source_game_id,
        dedupe_key,
        game_pgn,
        game_headers,
        game_title,
        white,
        black,
        event,
        played_at,
        move_number,
        ply,
        side,
        previous_move_san,
        previous_move_uci,
        fen_before,
        fen_after,
        played_move_san,
        played_move_uci,
        best_move_san,
        best_move_uci,
        loss_cp,
        severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    await db.batch(
      uniquePuzzles.map((puzzle) =>
        insert.bind(
          puzzle.sourceName,
          puzzle.sourcePlatform,
          puzzle.sourceUsername,
          Number.isFinite(puzzle.sourceGameId ?? Number.NaN)
            ? puzzle.sourceGameId
            : null,
          puzzle.dedupeKey,
          puzzle.gamePgn,
          puzzle.gameHeaders,
          puzzle.gameTitle,
          puzzle.white,
          puzzle.black,
          puzzle.event,
          puzzle.playedAt,
          puzzle.moveNumber,
          puzzle.ply,
          puzzle.side,
          puzzle.previousMoveSan,
          puzzle.previousMoveUci,
          puzzle.fenBefore,
          puzzle.fenAfter,
          puzzle.playedMoveSan,
          puzzle.playedMoveUci,
          puzzle.bestMoveSan,
          puzzle.bestMoveUci,
          puzzle.lossCp,
          puzzle.severity
        )
      )
    );

    return Response.json(
      { saved: uniquePuzzles.length, skipped: puzzles.length - uniquePuzzles.length },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
