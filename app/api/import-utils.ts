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
  openingName: string;
  eco: string;
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

export function normalizeTimeClass(value: string) {
  const clean = value.toLowerCase().trim();
  if (!clean) {
    return "";
  }

  if (["bullet", "blitz", "rapid", "classical", "correspondence"].includes(clean)) {
    return clean;
  }

  const baseSeconds = Number(clean.split("+")[0]);
  if (!Number.isFinite(baseSeconds)) {
    return clean;
  }

  if (baseSeconds < 180) {
    return "bullet";
  }
  if (baseSeconds < 600) {
    return "blitz";
  }
  if (baseSeconds < 1800) {
    return "rapid";
  }
  return "classical";
}

export function openingNameFromHeaders(headers: Record<string, string>) {
  if (headers.Opening) {
    return headers.Opening;
  }

  const ecoUrl = headers.ECOUrl || "";
  const slug = ecoUrl.split("/").filter(Boolean).at(-1) ?? "";
  if (!slug) {
    return "";
  }

  return decodeURIComponent(slug)
    .replace(/-/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    timeClass: normalizeTimeClass(headers.TimeControl || headers.TimeClass || ""),
    openingName: openingNameFromHeaders(headers),
    eco: headers.ECO || "",
  };
}

export function routeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}
