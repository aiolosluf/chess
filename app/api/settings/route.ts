import { getPuzzleD1 } from "@/db";
import { cleanUsername, routeErrorMessage } from "../import-utils";

type SettingsPayload = {
  chessComUsername?: string;
  lichessUsername?: string;
  fideId?: string;
  fideName?: string;
};

export async function GET() {
  try {
    const db = await getPuzzleD1();
    const settings = await db
      .prepare(
        `SELECT
          chesscom_username AS chessComUsername,
          lichess_username AS lichessUsername,
          fide_id AS fideId,
          fide_name AS fideName,
          updated_at AS updatedAt
        FROM user_settings
        WHERE id = 1`
      )
      .first();

    return Response.json({
      settings: settings ?? {
        chessComUsername: "",
        lichessUsername: "",
        fideId: "",
        fideName: "",
        updatedAt: "",
      },
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SettingsPayload;
    const chessComUsername = cleanUsername(payload.chessComUsername);
    const lichessUsername = cleanUsername(payload.lichessUsername);
    const fideId = cleanUsername(payload.fideId);
    const fideName = cleanUsername(payload.fideName);
    const db = await getPuzzleD1();

    await db
      .prepare(
        `INSERT INTO user_settings (
          id,
          chesscom_username,
          lichess_username,
          fide_id,
          fide_name,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          chesscom_username = excluded.chesscom_username,
          lichess_username = excluded.lichess_username,
          fide_id = excluded.fide_id,
          fide_name = excluded.fide_name,
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(chessComUsername, lichessUsername, fideId, fideName)
      .run();

    return Response.json({
      settings: { chessComUsername, lichessUsername, fideId, fideName },
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
