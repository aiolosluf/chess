import { getPuzzleD1 } from "@/db";
import { routeErrorMessage } from "../import-utils";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const platform = params.get("platform") ?? "";
    const username = params.get("username") ?? "";
    const limit = Math.max(1, Math.min(50, Number(params.get("limit") ?? 20)));
    const db = await getPuzzleD1();
    const filters = [];
    const values: (string | number)[] = [];

    if (status === "pending") {
      filters.push("puzzle_generated_at IS NULL");
    }

    if (platform) {
      filters.push("source_platform = ?");
      values.push(platform);
    }

    if (username) {
      filters.push("lower(source_username) = lower(?)");
      values.push(username);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const games = await db
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
          puzzle_generated_at AS puzzleGeneratedAt
        FROM games
        ${where}
        ORDER BY played_at DESC, id DESC
        LIMIT ?`
      )
      .bind(...values, limit)
      .all();

    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN puzzle_generated_at IS NULL THEN 1 ELSE 0 END), 0) AS pending
        FROM games`
      )
      .first();

    return Response.json({
      games: games.results ?? [],
      stats: stats ?? { total: 0, pending: 0 },
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
