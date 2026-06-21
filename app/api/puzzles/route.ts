import { getPuzzleD1 } from "@/db";

const PUZZLE_API_SCHEMA_VERSION = 3;
const SQL_CHUNK_SIZE = 80;

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
  timeClass?: string;
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
  analysisDepth?: number;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
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
  if (!names.has("analysis_depth")) {
    migrations.push(db.prepare("ALTER TABLE puzzles ADD COLUMN analysis_depth INTEGER NOT NULL DEFAULT 14"));
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
    timeClass: cleanText(puzzle.timeClass),
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
    analysisDepth: [8, 10, 12, 14, 16, 18].includes(Number(puzzle.analysisDepth))
      ? Number(puzzle.analysisDepth)
      : 14,
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

function dateCutoff(range: string | null) {
  if (!range || range === "all") {
    return "";
  }

  const date = new Date();
  if (range === "1y") {
    date.setFullYear(date.getFullYear() - 1);
  } else if (range === "6m") {
    date.setMonth(date.getMonth() - 6);
  } else if (range === "3m") {
    date.setMonth(date.getMonth() - 3);
  } else if (range === "30d") {
    date.setDate(date.getDate() - 30);
  } else {
    return "";
  }

  return date.toISOString().slice(0, 10).replace(/-/g, ".");
}

function multiValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "all");
}

function addMultiFilter(
  filters: string[],
  values: string[],
  column: string,
  rawValue: string
) {
  const selected = multiValues(rawValue);
  if (!selected.length) {
    return;
  }

  const hasUnknown = selected.includes("unknown");
  const concrete = selected.filter((item) => item !== "unknown");
  const parts = [];

  if (concrete.length) {
    parts.push(`${column} IN (${concrete.map(() => "?").join(",")})`);
    values.push(...concrete);
  }

  if (hasUnknown) {
    parts.push(`${column} = ''`);
  }

  if (parts.length) {
    filters.push(`(${parts.join(" OR ")})`);
  }
}

function buildPuzzleFilters(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = [];
  const values: string[] = [];
  const sourcePlatform = params.get("sourcePlatform") ?? "";
  const sourceUsername = params.get("sourceUsername") ?? "";
  const timeClass = params.get("timeClass") ?? "";
  const sourceGameId = params.get("sourceGameId") ?? "";
  const from = params.get("from") || dateCutoff(params.get("range"));
  const to = params.get("to") ?? "";

  addMultiFilter(filters, values, "source_platform", sourcePlatform);

  if (sourceUsername) {
    filters.push("lower(source_username) = lower(?)");
    values.push(sourceUsername);
  }

  if (sourceGameId) {
    filters.push("source_game_id = ?");
    values.push(sourceGameId);
  }

  addMultiFilter(filters, values, "time_class", timeClass);

  if (from) {
    filters.push("replace(played_at, '.', '-') >= replace(?, '.', '-')");
    values.push(from);
  }

  if (to) {
    filters.push("replace(played_at, '.', '-') <= replace(?, '.', '-')");
    values.push(to);
  }

  return {
    where: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    values,
  };
}

export async function GET(request: Request) {
  try {
    void PUZZLE_API_SCHEMA_VERSION;
    const db = await getPuzzleD1();
    await ensureExtendedPuzzleColumns(db);
    const { where, values } = buildPuzzleFilters(request);
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
          time_class AS timeClass,
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
          analysis_depth AS analysisDepth,
          attempts,
          solves,
          last_practiced_at AS lastPracticedAt
        FROM puzzles
        ${where}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 100`
      )
      .bind(...values)
      .all();

    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(attempts), 0) AS attempts,
          COALESCE(SUM(solves), 0) AS solves,
          COALESCE(ROUND(AVG(loss_cp)), 0) AS averageLoss
        FROM puzzles
        ${where}`
      )
      .bind(...values)
      .first();
    const practiceStats = await db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN is_first_attempt = 1 AND date(created_at) = date('now') THEN 1 ELSE 0 END), 0) AS todayAttempts,
          COALESCE(ROUND(AVG(CASE WHEN is_first_attempt = 1 AND date(created_at) = date('now') THEN improvement_cp END)), 0) AS todayImprovement,
          COALESCE(SUM(CASE WHEN is_first_attempt = 1 AND datetime(created_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS weekAttempts,
          COALESCE(ROUND(AVG(CASE WHEN is_first_attempt = 1 AND datetime(created_at) >= datetime('now', '-7 days') THEN improvement_cp END)), 0) AS weekImprovement,
          COALESCE(SUM(CASE WHEN is_first_attempt = 1 AND datetime(created_at) >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS monthAttempts,
          COALESCE(ROUND(AVG(CASE WHEN is_first_attempt = 1 AND datetime(created_at) >= datetime('now', '-30 days') THEN improvement_cp END)), 0) AS monthImprovement
        FROM practice_events`
      )
      .first();
    const daily = await db
      .prepare(
        `SELECT
          date(created_at) AS period,
          COUNT(*) AS attempts,
          COALESCE(ROUND(AVG(improvement_cp)), 0) AS improvement
        FROM practice_events
        WHERE is_first_attempt = 1
        GROUP BY date(created_at)
        ORDER BY period DESC
        LIMIT 14`
      )
      .all();
    const weekly = await db
      .prepare(
        `SELECT
          strftime('%Y-W%W', created_at) AS period,
          COUNT(*) AS attempts,
          COALESCE(ROUND(AVG(improvement_cp)), 0) AS improvement
        FROM practice_events
        WHERE is_first_attempt = 1
        GROUP BY strftime('%Y-W%W', created_at)
        ORDER BY period DESC
        LIMIT 12`
      )
      .all();

    return Response.json({
      puzzles: puzzles.results ?? [],
      stats: {
        ...(stats ?? { total: 0, attempts: 0, solves: 0, averageLoss: 0 }),
        ...(practiceStats ?? {}),
      },
      practiceHistory: {
        daily: daily.results ?? [],
        weekly: weekly.results ?? [],
      },
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
    const existingKeys = new Set<string>();
    for (const puzzleChunk of chunks(puzzles, SQL_CHUNK_SIZE)) {
      const existing = await db
        .prepare(
          `SELECT dedupe_key AS dedupeKey
          FROM puzzles
          WHERE dedupe_key IN (${puzzleChunk.map(() => "?").join(",")})`
        )
        .bind(...puzzleChunk.map((puzzle) => puzzle.dedupeKey))
        .all();
      for (const row of existing.results ?? []) {
        existingKeys.add(String(row.dedupeKey));
      }
    }
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
        time_class,
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
        severity,
        analysis_depth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const puzzleChunk of chunks(uniquePuzzles, SQL_CHUNK_SIZE)) {
      await db.batch(
        puzzleChunk.map((puzzle) =>
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
            puzzle.timeClass,
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
            puzzle.severity,
            puzzle.analysisDepth
          )
        )
      );
    }

    return Response.json(
      { saved: uniquePuzzles.length, skipped: puzzles.length - uniquePuzzles.length },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as { ids?: number[] };
    const ids = Array.isArray(payload.ids)
      ? payload.ids.map(Number).filter(Number.isFinite)
      : [];

    if (!ids.length) {
      return Response.json({ deleted: 0 });
    }

    const db = await getPuzzleD1();
    for (const idChunk of chunks(ids, SQL_CHUNK_SIZE)) {
      await db
        .prepare(`DELETE FROM puzzles WHERE id IN (${idChunk.map(() => "?").join(",")})`)
        .bind(...idChunk)
        .run();
    }

    return Response.json({ deleted: ids.length });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
