import { getPuzzleD1 } from "@/db";
import {
  cleanUsername,
  parseImportedGame,
  routeErrorMessage,
  splitPgnGames,
  type ParsedImportedGame,
  type Platform,
} from "../../import-utils";

type ImportPayload = {
  platform?: Platform;
  username?: string;
};

const API_HEADERS = {
  "user-agent": "ChessMistakeTrainer/1.0",
};

async function fetchText(url: string) {
  const response = await fetch(url, { headers: API_HEADERS });
  if (!response.ok) {
    throw new Error(`${url} 返回 ${response.status}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { headers: API_HEADERS });
  if (!response.ok) {
    throw new Error(`${url} 返回 ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function loadChessComPgns(username: string) {
  const profile = await fetchJson<{ username?: string }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}`
  );
  const canonicalUsername = profile.username || username;
  const archives = await fetchJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(canonicalUsername)}/games/archives`
  );
  let pgn = "";

  for (const archive of archives.archives ?? []) {
    pgn += `\n\n${await fetchText(`${archive}/pgn`)}`;
  }

  return { canonicalUsername, pgn };
}

async function loadLichessPgns(username: string) {
  const profile = await fetchJson<{ username?: string }>(
    `https://lichess.org/api/user/${encodeURIComponent(username)}`
  );
  const canonicalUsername = profile.username || username;
  const params = new URLSearchParams({
    clocks: "false",
    evals: "false",
    opening: "true",
    tags: "true",
  });
  const pgn = await fetchText(
    `https://lichess.org/api/games/user/${encodeURIComponent(canonicalUsername)}?${params}`
  );

  return { canonicalUsername, pgn };
}

async function saveGames(
  db: D1Database,
  platform: Platform,
  username: string,
  games: ParsedImportedGame[]
) {
  if (!games.length) {
    return { saved: 0, skipped: 0 };
  }

  const existing = await db
    .prepare(
      `SELECT game_key AS gameKey
      FROM games
      WHERE game_key IN (${games.map(() => "?").join(",")})`
    )
    .bind(...games.map((game) => game.gameKey))
    .all();
  const existingKeys = new Set(
    (existing.results ?? []).map((row) => String(row.gameKey))
  );
  const uniqueGames = games.filter(
    (game, index, all) =>
      !existingKeys.has(game.gameKey) &&
      all.findIndex((item) => item.gameKey === game.gameKey) === index
  );

  if (!uniqueGames.length) {
    return { saved: 0, skipped: games.length };
  }

  const insert = db.prepare(
    `INSERT INTO games (
      source_platform,
      source_username,
      source_url,
      game_key,
      pgn,
      game_headers,
      game_title,
      white,
      black,
      event,
      played_at,
      user_side,
      time_class
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  await db.batch(
    uniqueGames.map((game) =>
      insert.bind(
        platform,
        username,
        game.sourceUrl,
        game.gameKey,
        game.pgn,
        JSON.stringify(game.headers),
        game.gameTitle,
        game.white,
        game.black,
        game.event,
        game.playedAt,
        game.userSide,
        game.timeClass
      )
    )
  );

  return { saved: uniqueGames.length, skipped: games.length - uniqueGames.length };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ImportPayload;
    const platform = payload.platform;
    const username = cleanUsername(payload.username);

    if (!username || (platform !== "chesscom" && platform !== "lichess")) {
      return Response.json({ error: "平台或用户名无效" }, { status: 400 });
    }

    const db = await getPuzzleD1();
    const imported =
      platform === "chesscom"
        ? await loadChessComPgns(username)
        : await loadLichessPgns(username);
    const games = splitPgnGames(imported.pgn)
      .map((pgn) => parseImportedGame(platform, imported.canonicalUsername, pgn))
      .filter((game) => game !== null);
    const result = await saveGames(
      db,
      platform,
      imported.canonicalUsername,
      games
    );

    return Response.json({
      platform,
      username: imported.canonicalUsername,
      total: games.length,
      ...result,
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
