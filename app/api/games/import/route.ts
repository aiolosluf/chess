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
const SQL_CHUNK_SIZE = 80;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

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

function playedAtToTime(value: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.includes(".")
    ? value.replace(/\./g, "-")
    : value;
  const parsed = Date.parse(`${normalized.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chessComArchiveMonth(archiveUrl: string) {
  const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/);
  if (!match) {
    return 0;
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
}

async function latestLocalPlayedAt(
  db: D1Database,
  platform: Platform,
  username: string
) {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(played_at), '') AS latestPlayedAt
      FROM games
      WHERE source_platform = ?
        AND lower(source_username) = lower(?)`
    )
    .bind(platform, username)
    .first<{ latestPlayedAt?: string }>();

  return row?.latestPlayedAt ?? "";
}

async function resolveChessComUsername(username: string) {
  const profile = await fetchJson<{ username?: string }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}`
  );

  return profile.username || username;
}

async function resolveLichessUsername(username: string) {
  const profile = await fetchJson<{ username?: string }>(
    `https://lichess.org/api/user/${encodeURIComponent(username)}`
  );

  return profile.username || username;
}

async function loadChessComPgns(username: string, sincePlayedAt = "") {
  const canonicalUsername = username;
  const archives = await fetchJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(canonicalUsername)}/games/archives`
  );
  let pgn = "";
  const sinceTime = playedAtToTime(sincePlayedAt);
  const sinceMonth = sinceTime
    ? Date.UTC(new Date(sinceTime).getUTCFullYear(), new Date(sinceTime).getUTCMonth(), 1)
    : 0;

  for (const archive of archives.archives ?? []) {
    if (sinceMonth && chessComArchiveMonth(archive) < sinceMonth) {
      continue;
    }
    pgn += `\n\n${await fetchText(`${archive}/pgn`)}`;
  }

  return { canonicalUsername, pgn };
}

async function loadLichessPgns(username: string, sincePlayedAt = "") {
  const canonicalUsername = username;
  const params = new URLSearchParams({
    clocks: "false",
    evals: "false",
    opening: "true",
    tags: "true",
  });
  const sinceTime = playedAtToTime(sincePlayedAt);
  if (sinceTime) {
    params.set("since", String(sinceTime));
  }
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

  const existingKeys = new Set<string>();
  for (const gameChunk of chunks(games, SQL_CHUNK_SIZE)) {
    const existing = await db
      .prepare(
        `SELECT game_key AS gameKey
        FROM games
        WHERE game_key IN (${gameChunk.map(() => "?").join(",")})`
      )
      .bind(...gameChunk.map((game) => game.gameKey))
      .all();
    for (const row of existing.results ?? []) {
      existingKeys.add(String(row.gameKey));
    }
  }
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
      time_class,
      opening_name,
      eco
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const gameChunk of chunks(uniqueGames, SQL_CHUNK_SIZE)) {
    await db.batch(
      gameChunk.map((game) =>
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
          game.timeClass,
          game.openingName,
          game.eco
        )
      )
    );
  }

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
    const canonicalUsername =
      platform === "chesscom"
        ? await resolveChessComUsername(username)
        : await resolveLichessUsername(username);
    const latestPlayedAt = await latestLocalPlayedAt(
      db,
      platform,
      canonicalUsername
    );
    const imported =
      platform === "chesscom"
        ? await loadChessComPgns(canonicalUsername, latestPlayedAt)
        : await loadLichessPgns(canonicalUsername, latestPlayedAt);
    const games = splitPgnGames(imported.pgn)
      .map((pgn) => parseImportedGame(platform, canonicalUsername, pgn))
      .filter((game) => game !== null)
      .filter((game) => !latestPlayedAt || playedAtToTime(game.playedAt) >= playedAtToTime(latestPlayedAt));
    const result = await saveGames(
      db,
      platform,
      canonicalUsername,
      games
    );

    return Response.json({
      platform,
      username: canonicalUsername,
      latestPlayedAt,
      total: games.length,
      ...result,
    });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
