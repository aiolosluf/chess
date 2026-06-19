import { getPuzzleD1 } from "@/db";

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
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

function buildFilters(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = [];
  const values: string[] = [];
  const sourcePlatform = params.get("sourcePlatform") ?? "";
  const timeClass = params.get("timeClass") ?? "";
  const from = dateCutoff(params.get("range"));

  if (sourcePlatform && sourcePlatform !== "all") {
    filters.push("source_platform = ?");
    values.push(sourcePlatform);
  }

  if (timeClass && timeClass !== "all") {
    filters.push("time_class = ?");
    values.push(timeClass);
  }

  if (from) {
    filters.push("replace(played_at, '.', '-') >= replace(?, '.', '-')");
    values.push(from);
  }

  return {
    where: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    values,
  };
}

export async function GET(request: Request) {
  try {
    const db = await getPuzzleD1();
    const { where, values } = buildFilters(request);
    const puzzle = await db
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
          attempts,
          solves,
          last_practiced_at AS lastPracticedAt
        FROM puzzles
        ${where}
        ORDER BY RANDOM()
        LIMIT 1`
      )
      .bind(...values)
      .first();

    return Response.json({ puzzle: puzzle ?? null });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
