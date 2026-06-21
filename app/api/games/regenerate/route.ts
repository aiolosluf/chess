import { getPuzzleD1 } from "@/db";
import { routeErrorMessage } from "../../import-utils";

type RegeneratePayload = {
  id?: number;
  analysisDepth?: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegeneratePayload;
    const id = Number(payload.id);
    const analysisDepth = [8, 10, 12, 14, 16, 18].includes(
      Number(payload.analysisDepth)
    )
      ? Number(payload.analysisDepth)
      : 14;

    if (!Number.isFinite(id)) {
      return Response.json({ error: "Invalid game id" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    const deleted = await db
      .prepare("DELETE FROM puzzles WHERE source_game_id = ?")
      .bind(id)
      .run();
    await db
      .prepare(
        `UPDATE games
        SET puzzle_generated_at = NULL,
            analysis_depth = ?
        WHERE id = ?`
      )
      .bind(analysisDepth, id)
      .run();

    return Response.json({
      queued: 1,
      deleted: deleted.meta.changes ?? 0,
      analysisDepth,
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
