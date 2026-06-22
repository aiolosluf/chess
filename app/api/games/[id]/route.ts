import { getPuzzleD1 } from "@/db";
import { routeErrorMessage } from "../../import-utils";

function idFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split("/");
  return Number(segments.at(-1));
}

export async function GET(request: Request) {
  try {
    const id = idFromRequest(request);
    if (!Number.isFinite(id)) {
      return Response.json({ error: "Invalid game id" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    const game = await db
      .prepare(
        `SELECT
          id,
          created_at AS createdAt,
          imported_at AS importedAt,
          source_platform AS sourcePlatform,
          source_username AS sourceUsername,
          source_url AS sourceUrl,
          game_key AS gameKey,
          pgn,
          game_headers AS gameHeaders,
          game_title AS gameTitle,
          white,
          black,
          event,
          played_at AS playedAt,
          user_side AS userSide,
          time_class AS timeClass,
          opening_name AS openingName,
          eco,
          analysis_depth AS analysisDepth,
          puzzle_generated_at AS puzzleGeneratedAt
        FROM games
        WHERE id = ?`
      )
      .bind(id)
      .first();

    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    return Response.json({ game });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
