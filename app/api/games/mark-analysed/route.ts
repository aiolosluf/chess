import { getPuzzleD1 } from "@/db";
import { routeErrorMessage } from "../../import-utils";

type MarkPayload = {
  ids?: number[];
  analysisDepth?: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MarkPayload;
    const ids = Array.isArray(payload.ids)
      ? payload.ids.map(Number).filter(Number.isFinite)
      : [];

    if (!ids.length) {
      return Response.json({ marked: 0 });
    }

    const analysisDepth = 18;
    const db = await getPuzzleD1();
    await db.batch(
      ids.map((id) =>
        db
          .prepare(
            `UPDATE games
            SET puzzle_generated_at = CURRENT_TIMESTAMP,
                analysis_depth = ?
            WHERE id = ?`
          )
          .bind(analysisDepth, id)
      )
    );

    return Response.json({ marked: ids.length });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
