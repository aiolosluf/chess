import { cleanUsername, routeErrorMessage, type Platform } from "../../import-utils";

type ValidatePayload = {
  platform?: Platform;
  username?: string;
};

const API_HEADERS = {
  "user-agent": "ChessMistakeTrainer/1.0",
};

async function validateChessCom(username: string) {
  const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`, {
    headers: API_HEADERS,
  });

  if (!response.ok) {
    return { ok: false, message: "没有找到这个 chess.com 用户" };
  }

  const profile = (await response.json()) as {
    username?: string;
    url?: string;
    name?: string;
  };

  return {
    ok: true,
    username: profile.username || username,
    displayName: profile.name || profile.username || username,
    profileUrl: profile.url || `https://www.chess.com/member/${username}`,
  };
}

async function validateLichess(username: string) {
  const response = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
    headers: API_HEADERS,
  });

  if (!response.ok) {
    return { ok: false, message: "没有找到这个 lichess 用户" };
  }

  const profile = (await response.json()) as {
    username?: string;
    profile?: { firstName?: string; lastName?: string };
    url?: string;
  };
  const name = [profile.profile?.firstName, profile.profile?.lastName]
    .filter(Boolean)
    .join(" ");

  return {
    ok: true,
    username: profile.username || username,
    displayName: name || profile.username || username,
    profileUrl: profile.url || `https://lichess.org/@/${username}`,
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ValidatePayload;
    const username = cleanUsername(payload.username);
    const platform = payload.platform;

    if (!username || (platform !== "chesscom" && platform !== "lichess")) {
      return Response.json({ error: "平台或用户名无效" }, { status: 400 });
    }

    const result =
      platform === "chesscom"
        ? await validateChessCom(username)
        : await validateLichess(username);

    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    return Response.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
