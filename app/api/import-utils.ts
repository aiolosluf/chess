export type Platform = "chesscom" | "lichess";

export type ParsedImportedGame = {
  pgn: string;
  headers: Record<string, string>;
  gameTitle: string;
  white: string;
  black: string;
  event: string;
  playedAt: string;
  userSide: "w" | "b" | "";
  sourceUrl: string;
  gameKey: string;
  timeClass: string;
};

export function cleanUsername(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function splitPgnGames(text: string) {
  const clean = text.replace(/\uFEFF/g, "").trim();
  if (!clean) {
    return [];
  }

  const starts = [...clean.matchAll(/(?=^\s*\[Event\s+")/gm)].map(
    (match) => match.index ?? 0
  );

  if (!starts.length) {
    return [clean];
  }

  return starts
    .map((start, index) => clean.slice(start, starts[index + 1]).trim())
    .filter(Boolean);
}

export function parsePgnHeaders(pgn: string) {
  const headers: Record<string, string> = {};
  const matches = pgn.matchAll(/^\[([A-Za-z0-9_]+)\s+"((?:\\"|[^"])*)"\]\s*$/gm);

  for (const match of matches) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
  }

  return headers;
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function parseImportedGame(
  platform: Platform,
  username: string,
  pgn: string
): ParsedImportedGame | null {
  const headers = parsePgnHeaders(pgn);
  const white = headers.White || "White";
  const black = headers.Black || "Black";
  const lowerUsername = username.toLowerCase();
  const userSide =
    white.toLowerCase() === lowerUsername
      ? "w"
      : black.toLowerCase() === lowerUsername
      ? "b"
      : "";

  if (!userSide) {
    return null;
  }

  const event = headers.Event || platform;
  const playedAt = headers.UTCDate || headers.Date || "";
  const sourceUrl = headers.Link || headers.Site || "";
  const gameKey = `${platform}:${sourceUrl || hashString(pgn)}`;

  return {
    pgn,
    headers,
    gameTitle: `${white} - ${black}`,
    white,
    black,
    event,
    playedAt,
    userSide,
    sourceUrl,
    gameKey,
    timeClass: headers.TimeControl || "",
  };
}

export function routeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}
