import { getPuzzleD1 } from "@/db";

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() ?? "";
    const db = await getPuzzleD1();
    const filters = ["opening_name <> ''"];
    const values: string[] = [];

    if (query) {
      filters.push("(lower(opening_name) LIKE lower(?) OR lower(eco) LIKE lower(?))");
      values.push(`%${query}%`, `%${query}%`);
    }

    const rows = await db
      .prepare(
        `SELECT
          opening_name AS openingName,
          eco,
          COUNT(*) AS count
        FROM puzzles
        WHERE ${filters.join(" AND ")}
        GROUP BY opening_name, eco
        ORDER BY count DESC, opening_name ASC
        LIMIT 30`
      )
      .bind(...values)
      .all();

    return Response.json({ openings: rows.results ?? [] });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
