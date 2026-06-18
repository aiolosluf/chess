import { getPuzzleD1 } from "@/db";

function toRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function idFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split("/");
  return Number(segments.at(-1));
}

export async function DELETE(request: Request) {
  try {
    const id = idFromRequest(request);

    if (!Number.isFinite(id)) {
      return Response.json({ error: "题目编号无效" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    await db.prepare("DELETE FROM puzzles WHERE id = ?").bind(id).run();

    return Response.json({ deleted: id });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
