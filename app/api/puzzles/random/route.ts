import { getPuzzleD1 } from "@/db";

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  try {
    const db = await getPuzzleD1();
    const puzzle = await db
      .prepare(
        `SELECT
          id,
          created_at AS createdAt,
          source_name AS sourceName,
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
        ORDER BY RANDOM()
        LIMIT 1`
      )
      .first();

    return Response.json({ puzzle: puzzle ?? null });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
