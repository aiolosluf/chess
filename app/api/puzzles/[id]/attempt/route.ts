import { getPuzzleD1 } from "@/db";

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function idFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split("/");
  return Number(segments.at(-2));
}

export async function POST(request: Request) {
  try {
    const id = idFromRequest(request);
    const payload = (await request.json()) as {
      correct?: boolean;
      improvementCp?: number;
    };

    if (!Number.isFinite(id)) {
      return Response.json({ error: "题目编号无效" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    const practicedToday = await db
      .prepare(
        `SELECT id
        FROM practice_events
        WHERE puzzle_id = ?
          AND date(created_at) = date('now')
        LIMIT 1`
      )
      .bind(id)
      .first<{ id?: number }>();
    const isFirstAttempt = !practicedToday;
    const improvementCp = Math.round(Number(payload.improvementCp ?? 0));
    await db
      .prepare(
        `UPDATE puzzles
        SET attempts = attempts + 1,
            solves = solves + ?,
            last_practiced_at = CURRENT_TIMESTAMP
        WHERE id = ?`
      )
      .bind(payload.correct ? 1 : 0, id)
      .run();
    await db
      .prepare(
        `INSERT INTO practice_events (
          puzzle_id,
          correct,
          improvement_cp,
          is_first_attempt
        ) VALUES (?, ?, ?, ?)`
      )
      .bind(
        id,
        payload.correct ? 1 : 0,
        Number.isFinite(improvementCp) ? improvementCp : 0,
        isFirstAttempt ? 1 : 0
      )
      .run();

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
        WHERE id = ?`
      )
      .bind(id)
      .first();

    return Response.json({ puzzle });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
