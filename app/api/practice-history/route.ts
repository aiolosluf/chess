import { getPuzzleD1 } from "@/db";

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const limit = Math.max(1, Math.min(50, Number(params.get("limit") ?? 20)));
    const db = await getPuzzleD1();
    const rows = await db
      .prepare(
        `SELECT
          practice_events.id AS eventId,
          practice_events.created_at AS attemptedAt,
          practice_events.correct AS correct,
          practice_events.improvement_cp AS improvementCp,
          puzzles.id AS id,
          puzzles.created_at AS createdAt,
          puzzles.source_name AS sourceName,
          puzzles.source_platform AS sourcePlatform,
          puzzles.source_username AS sourceUsername,
          puzzles.source_game_id AS sourceGameId,
          puzzles.dedupe_key AS dedupeKey,
          puzzles.game_pgn AS gamePgn,
          puzzles.game_headers AS gameHeaders,
          puzzles.game_title AS gameTitle,
          puzzles.white,
          puzzles.black,
          puzzles.event,
          puzzles.played_at AS playedAt,
          puzzles.time_class AS timeClass,
          puzzles.opening_name AS openingName,
          puzzles.eco,
          puzzles.move_number AS moveNumber,
          puzzles.ply,
          puzzles.side,
          puzzles.previous_move_san AS previousMoveSan,
          puzzles.previous_move_uci AS previousMoveUci,
          puzzles.fen_before AS fenBefore,
          puzzles.fen_after AS fenAfter,
          puzzles.played_move_san AS playedMoveSan,
          puzzles.played_move_uci AS playedMoveUci,
          puzzles.best_move_san AS bestMoveSan,
          puzzles.best_move_uci AS bestMoveUci,
          puzzles.loss_cp AS lossCp,
          puzzles.severity,
          puzzles.analysis_depth AS analysisDepth,
          puzzles.attempts,
          puzzles.solves,
          puzzles.last_practiced_at AS lastPracticedAt
        FROM practice_events
        JOIN puzzles ON puzzles.id = practice_events.puzzle_id
        ORDER BY datetime(practice_events.created_at) DESC, practice_events.id DESC
        LIMIT ?`
      )
      .bind(limit)
      .all();

    return Response.json({ history: rows.results ?? [] });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
