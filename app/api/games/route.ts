import { getPuzzleD1 } from "@/db";
import { routeErrorMessage } from "../import-utils";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const platform = params.get("platform") ?? "";
    const username = params.get("username") ?? "";
    const query = params.get("q")?.trim() ?? "";
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

    if (query) {
      filters.push(
        `(lower(game_title) LIKE lower(?)
          OR lower(white) LIKE lower(?)
          OR lower(black) LIKE lower(?)
          OR lower(source_username) LIKE lower(?)
          OR lower(event) LIKE lower(?)
          OR lower(opening_name) LIKE lower(?)
          OR lower(eco) LIKE lower(?))`
      );
      values.push(...Array(7).fill(`%${query}%`));
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
          opening_name AS openingName,
          eco,
          analysis_depth AS analysisDepth,
          (
            SELECT COUNT(*)
            FROM puzzles
            WHERE puzzles.source_game_id = games.id
          ) AS puzzleCount,
          puzzle_generated_at AS puzzleGeneratedAt
        FROM games
        ${where}
        ORDER BY played_at DESC, id DESC
        LIMIT ?`
      )
      .bind(...values, limit)
      .all();

    const statsFilters = filters.filter((filter) => filter !== "puzzle_generated_at IS NULL");
    const filteredStatsValues: (string | number)[] = [];
    if (platform) {
      filteredStatsValues.push(platform);
    }
    if (username) {
      filteredStatsValues.push(username);
    }
    if (query) {
      filteredStatsValues.push(...Array(7).fill(`%${query}%`));
    }
    const statsWhere = statsFilters.length
      ? `WHERE ${statsFilters.join(" AND ")}`
      : "";
    const puzzleStatsValues: (string | number)[] = [];
    if (platform) {
      puzzleStatsValues.push(platform);
    }
    if (username) {
      puzzleStatsValues.push(username);
    }
    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN puzzle_generated_at IS NULL THEN 1 ELSE 0 END), 0) AS pending
          ,COALESCE(MAX(played_at), '') AS latestPlayedAt,
          (
            SELECT COUNT(*)
            FROM puzzles
            WHERE ${platform ? "puzzles.source_platform = ?" : "1 = 1"}
              AND ${username ? "lower(puzzles.source_username) = lower(?)" : "1 = 1"}
          ) AS puzzleCount
        FROM games`
        + ` ${statsWhere}`
      )
      .bind(...puzzleStatsValues, ...filteredStatsValues)
      .first();

    return Response.json({
      games: games.results ?? [],
      stats: stats ?? { total: 0, pending: 0 },
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
