import { getPuzzleD1 } from "@/db";
import { cleanUsername, routeErrorMessage, type Platform } from "../../import-utils";

type AccountPayload = {
  platform?: Platform | "fide";
  username?: string;
  deleteData?: boolean;
};

const SETTING_COLUMN = {
  chesscom: "chesscom_username",
  lichess: "lichess_username",
  fide: "fide_id",
} as const;

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as AccountPayload;
    const platform = payload.platform;
    const username = cleanUsername(payload.username);
    const deleteData = Boolean(payload.deleteData);

    if (platform !== "chesscom" && platform !== "lichess" && platform !== "fide") {
      return Response.json({ error: "平台无效" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    if (deleteData && username) {
      await db.batch([
        db
          .prepare(
            "DELETE FROM puzzles WHERE source_platform = ? AND lower(source_username) = lower(?)"
          )
          .bind(platform, username),
        db
          .prepare(
            "DELETE FROM games WHERE source_platform = ? AND lower(source_username) = lower(?)"
          )
          .bind(platform, username),
      ]);
    }

    const column = SETTING_COLUMN[platform];
    const extra = platform === "fide" ? ", fide_name = ''" : "";
    await db
      .prepare(
        `UPDATE user_settings
        SET ${column} = ''${extra},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1`
      )
      .run();

    return Response.json({ unbound: platform, deletedData: deleteData });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
