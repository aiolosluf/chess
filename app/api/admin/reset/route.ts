import { getPuzzleD1 } from "@/db";
import { routeErrorMessage } from "../../import-utils";

export async function DELETE() {
  try {
    const db = await getPuzzleD1();
    await db.batch([
      db.prepare("DELETE FROM puzzles"),
      db.prepare("DELETE FROM games"),
      db.prepare("DELETE FROM practice_events"),
    ]);

    return Response.json({ cleared: true });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
