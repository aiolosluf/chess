"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Languages,
  Loader2,
  RefreshCw,
  Settings,
  Square,
} from "lucide-react";
import Link from "next/link";
import { Chess, type Move } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";

type Locale = "zh" | "en";
type Platform = "chesscom" | "lichess";
type Severity = "inaccuracy" | "mistake" | "blunder";

type ImportedGame = {
  id: number;
  sourcePlatform: Platform;
  sourceUsername: string;
  sourceUrl: string;
  pgn: string;
  gameHeaders: string;
  gameTitle: string;
  white: string;
  black: string;
  event: string;
  playedAt: string;
  userSide: "w" | "b";
  puzzleGeneratedAt: string | null;
};

type ParsedGame = {
  pgn: string;
  headers: Record<string, string>;
  moves: Move[];
};

type EngineAnalysis = {
  bestMove: string;
  scoreCp: number;
};

type PuzzleCandidate = {
  dedupeKey: string;
  sourceName: string;
  sourcePlatform: Platform;
  sourceUsername: string;
  sourceGameId: number;
  gamePgn: string;
  gameHeaders: string;
  gameTitle: string;
  white: string;
  black: string;
  event: string;
  playedAt: string;
  moveNumber: number;
  ply: number;
  side: "w" | "b";
  previousMoveSan: string;
  previousMoveUci: string;
  fenBefore: string;
  fenAfter: string;
  playedMoveSan: string;
  playedMoveUci: string;
  bestMoveSan: string;
  bestMoveUci: string;
  lossCp: number;
  severity: Severity;
};

const COPY = {
  zh: {
    title: "用户设置",
    subtitle: "绑定公开用户名，自动导入对局，并按她实际执色生成错题。",
    back: "返回练习",
    library: "题库管理",
    chesscom: "Chess.com 用户名",
    lichess: "Lichess 用户名",
    save: "保存",
    validate: "验证",
    sync: "检查更新",
    importAnalyze: "导入并生成题目",
    stop: "停止",
    depth: "分析深度",
    batch: "每批棋局",
    totalGames: "棋局",
    pendingGames: "待分析",
    imported: "导入",
    puzzles: "题目",
    status: "状态",
    ready: "等待操作",
    loading: "读取设置中",
    saved: "设置已保存",
    verified: "验证成功",
    importing: "正在抓取公开对局",
    foundNew: "发现新棋局",
    askGenerate: "是否现在生成题目？",
    noNewGames: "没有发现新棋局",
    analyzing: "正在分析",
    done: "完成",
    noUsername: "请先填写用户名",
    noPending: "没有待分析棋局",
    recentGames: "最近棋局记录",
    side: "执色",
    generated: "已生成",
    pending: "待分析",
    loadFailed: "加载失败",
  },
  en: {
    title: "User Settings",
    subtitle: "Connect public usernames, import games, and create puzzles for the side she played.",
    back: "Back",
    library: "Library",
    chesscom: "Chess.com username",
    lichess: "Lichess username",
    save: "Save",
    validate: "Verify",
    sync: "Check updates",
    importAnalyze: "Import and analyze",
    stop: "Stop",
    depth: "Depth",
    batch: "Batch",
    totalGames: "Games",
    pendingGames: "Pending",
    imported: "Imported",
    puzzles: "Puzzles",
    status: "Status",
    ready: "Ready",
    loading: "Loading settings",
    saved: "Settings saved",
    verified: "Verified",
    importing: "Importing public games",
    foundNew: "New games found",
    askGenerate: "Generate puzzles now?",
    noNewGames: "No new games found",
    analyzing: "Analyzing",
    done: "Done",
    noUsername: "Enter a username first",
    noPending: "No pending games",
    recentGames: "Recent games",
    side: "Side",
    generated: "Generated",
    pending: "Pending",
    loadFailed: "Could not load",
  },
} satisfies Record<Locale, Record<string, string>>;

const WORSE_MARGIN_CP = 70;

function parsePgnGame(pgn: string): ParsedGame | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false });
    const moves = chess.history({ verbose: true });

    if (!moves.length) {
      return null;
    }

    return { pgn, headers: chess.getHeaders(), moves };
  } catch {
    return null;
  }
}

function moveToUci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
}

function uciToSan(fen: string, uci: string) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || "q",
    });

    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

function classifyLoss(lossCp: number): Severity | null {
  if (lossCp >= 300) {
    return "blunder";
  }

  if (lossCp >= 150) {
    return "mistake";
  }

  if (lossCp >= WORSE_MARGIN_CP) {
    return "inaccuracy";
  }

  return null;
}

function parseScore(line: string) {
  const cp = line.match(/\bscore cp (-?\d+)/);
  if (cp) {
    return Number(cp[1]);
  }

  const mate = line.match(/\bscore mate (-?\d+)/);
  if (mate) {
    const moves = Number(mate[1]);
    const sign = moves >= 0 ? 1 : -1;
    return sign * (100000 - Math.min(Math.abs(moves), 99) * 1000);
  }

  return null;
}

class BrowserStockfish {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private listeners = new Set<(line: string) => void>();
  private busy = false;

  async analyzeFen(fen: string, depth: number): Promise<EngineAnalysis> {
    await this.ensureReady();

    while (this.busy) {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }

    this.busy = true;
    let scoreCp = 0;
    const onInfo = (line: string) => {
      if (!line.startsWith("info ")) {
        return;
      }

      const parsed = parseScore(line);
      if (parsed !== null) {
        scoreCp = parsed;
      }
    };

    try {
      this.listeners.add(onInfo);
      this.post("ucinewgame");
      this.post(`position fen ${fen}`);
      this.post(`go depth ${depth}`);
      const bestLine = await this.waitForLine(
        (line) => line.startsWith("bestmove "),
        Math.max(16000, depth * 2400)
      );
      return { bestMove: bestLine.split(/\s+/)[1] ?? "", scoreCp };
    } finally {
      this.listeners.delete(onInfo);
      this.busy = false;
    }
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.listeners.clear();
  }

  private ensureReady() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      if (typeof Worker === "undefined") {
        throw new Error("当前浏览器不能运行 Stockfish Worker");
      }

      this.worker = new Worker("/stockfish-18-lite-single.js");
      this.worker.onmessage = (event) => {
        const line = String(event.data);
        this.listeners.forEach((listener) => listener(line));
      };
      this.post("uci");
      await this.waitForLine((line) => line === "uciok", 12000);
      this.post("setoption name Skill Level value 20");
      this.post("isready");
      await this.waitForLine((line) => line === "readyok", 12000);
    })();

    return this.readyPromise;
  }

  private post(command: string) {
    this.worker?.postMessage(command);
  }

  private waitForLine(matcher: (line: string) => boolean, timeoutMs: number) {
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Stockfish 响应超时"));
      }, timeoutMs);
      const listener = (line: string) => {
        if (matcher(line)) {
          cleanup();
          resolve(line);
        }
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        this.listeners.delete(listener);
      };
      this.listeners.add(listener);
    });
  }
}

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error || payload.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

function platformLabel(platform: Platform) {
  return platform === "chesscom" ? "Chess.com" : "Lichess";
}

export default function SettingsPage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [chessComUsername, setChessComUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");
  const [depth, setDepth] = useState(8);
  const [batchSize, setBatchSize] = useState(12);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(COPY.zh.ready);
  const [stats, setStats] = useState({ total: 0, pending: 0 });
  const [recentGames, setRecentGames] = useState<ImportedGame[]>([]);
  const [progress, setProgress] = useState({ games: 0, puzzles: 0 });
  const engineRef = useRef<BrowserStockfish | null>(null);
  const cancelRef = useRef(false);
  const copy = COPY[locale];

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }
      const payload = (await response.json()) as {
        settings?: {
          chessComUsername?: string;
          lichessUsername?: string;
        };
      };
      setChessComUsername(payload.settings?.chessComUsername ?? "");
      setLichessUsername(payload.settings?.lichessUsername ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    }
  }, [copy.loadFailed]);

  const loadGameStats = useCallback(async () => {
    const response = await fetch("/api/games?limit=1");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      stats?: { total?: number; pending?: number };
      games?: ImportedGame[];
    };
    setStats({
      total: Number(payload.stats?.total ?? 0),
      pending: Number(payload.stats?.pending ?? 0),
    });
    setRecentGames(payload.games ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
      void loadGameStats();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      engineRef.current?.dispose();
    };
  }, [loadGameStats, loadSettings]);

  async function saveSettings(next?: {
    chessComUsername?: string;
    lichessUsername?: string;
  }) {
    setMessage("");
    const nextChessComUsername = next?.chessComUsername ?? chessComUsername;
    const nextLichessUsername = next?.lichessUsername ?? lichessUsername;
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chessComUsername: nextChessComUsername,
        lichessUsername: nextLichessUsername,
      }),
    });
    if (!response.ok) {
      throw new Error(await readJsonError(response));
    }
    setMessage(copy.saved);
  }

  async function validate(platform: Platform) {
    const username =
      platform === "chesscom" ? chessComUsername.trim() : lichessUsername.trim();
    if (!username) {
      setMessage(copy.noUsername);
      return;
    }

    setIsBusy(true);
    setMessage(`${platformLabel(platform)} ${copy.validate}...`);
    try {
      const response = await fetch("/api/settings/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform, username }),
      });
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }
      const payload = (await response.json()) as { username?: string };
      if (platform === "chesscom") {
        setChessComUsername(payload.username ?? username);
        await saveSettings({ chessComUsername: payload.username ?? username });
      } else {
        setLichessUsername(payload.username ?? username);
        await saveSettings({ lichessUsername: payload.username ?? username });
      }
      setMessage(`${platformLabel(platform)} ${copy.verified}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function importAndAnalyze(platform: Platform) {
    const username =
      platform === "chesscom" ? chessComUsername.trim() : lichessUsername.trim();
    if (!username) {
      setMessage(copy.noUsername);
      return;
    }

    cancelRef.current = false;
    setIsBusy(true);
    setProgress({ games: 0, puzzles: 0 });
    try {
      const importResult = await syncPlatformGames(platform, username);
      await analyzePending(platform, importResult.username);
      await loadGameStats();
      setMessage(copy.done);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function syncOnly(platform: Platform) {
    const username =
      platform === "chesscom" ? chessComUsername.trim() : lichessUsername.trim();
    if (!username) {
      setMessage(copy.noUsername);
      return;
    }

    cancelRef.current = false;
    setIsBusy(true);
    setProgress({ games: 0, puzzles: 0 });
    try {
      const importResult = await syncPlatformGames(platform, username);
      await loadGameStats();

      if (!importResult.saved) {
        setMessage(`${platformLabel(platform)} ${copy.noNewGames}`);
        return;
      }

      const shouldGenerate = window.confirm(
        `${platformLabel(platform)} ${copy.foundNew}: ${importResult.saved}\n${copy.askGenerate}`
      );
      if (shouldGenerate) {
        await analyzePending(platform, importResult.username);
        await loadGameStats();
        setMessage(copy.done);
      } else {
        setMessage(
          `${platformLabel(platform)} ${copy.foundNew}: ${importResult.saved}`
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function syncPlatformGames(platform: Platform, username: string) {
    await saveSettings();
    setMessage(`${platformLabel(platform)} ${copy.importing}`);
    const importResponse = await fetch("/api/games/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, username }),
    });
    if (!importResponse.ok) {
      throw new Error(await readJsonError(importResponse));
    }
    const importResult = (await importResponse.json()) as {
      username?: string;
      saved?: number;
      skipped?: number;
      total?: number;
    };
    const canonicalUsername = importResult.username ?? username;
    if (platform === "chesscom") {
      setChessComUsername(canonicalUsername);
      await saveSettings({ chessComUsername: canonicalUsername });
    } else {
      setLichessUsername(canonicalUsername);
      await saveSettings({ lichessUsername: canonicalUsername });
    }
    setMessage(
      `${platformLabel(platform)} ${copy.imported}: ${importResult.saved ?? 0}/${importResult.total ?? 0}`
    );

    return {
      username: canonicalUsername,
      saved: Number(importResult.saved ?? 0),
      skipped: Number(importResult.skipped ?? 0),
      total: Number(importResult.total ?? 0),
    };
  }

  async function analyzePending(platform: Platform, username: string) {
    engineRef.current ??= new BrowserStockfish();

    while (!cancelRef.current) {
      const pendingResponse = await fetch(
        `/api/games?status=pending&platform=${platform}&username=${encodeURIComponent(
          username
        )}&limit=${batchSize}`
      );
      if (!pendingResponse.ok) {
        throw new Error(await readJsonError(pendingResponse));
      }
      const pending = (await pendingResponse.json()) as { games?: ImportedGame[] };
      const games = pending.games ?? [];

      if (!games.length) {
        setMessage(copy.noPending);
        break;
      }

      for (const game of games) {
        if (cancelRef.current) {
          break;
        }

        setMessage(`${copy.analyzing}: ${game.gameTitle}`);
        const candidates = await analyzeImportedGame(game);
        if (candidates.length) {
          const saveResponse = await fetch("/api/puzzles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ puzzles: candidates }),
          });
          if (!saveResponse.ok) {
            throw new Error(await readJsonError(saveResponse));
          }
          const saved = (await saveResponse.json()) as { saved?: number };
          setProgress((current) => ({
            games: current.games + 1,
            puzzles: current.puzzles + Number(saved.saved ?? 0),
          }));
        } else {
          setProgress((current) => ({ ...current, games: current.games + 1 }));
        }

        await fetch("/api/games/mark-analysed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [game.id] }),
        });
      }
    }
  }

  async function analyzeImportedGame(game: ImportedGame) {
    const parsed = parsePgnGame(game.pgn);
    if (!parsed || !engineRef.current) {
      return [];
    }

    const candidates: PuzzleCandidate[] = [];

    for (let index = 0; index < parsed.moves.length; index += 1) {
      if (cancelRef.current) {
        break;
      }

      const move = parsed.moves[index];
      if (move.color !== game.userSide) {
        continue;
      }

      const before = await engineRef.current.analyzeFen(move.before, depth);
      const bestMoveUci = before.bestMove.toLowerCase();
      const playedMoveUci = moveToUci(move);
      if (!bestMoveUci || bestMoveUci === playedMoveUci) {
        continue;
      }

      const after = await engineRef.current.analyzeFen(
        move.after,
        Math.max(6, depth - 1)
      );
      const playedScore = -after.scoreCp;
      const lossCp = Math.round(Math.min(2000, Math.max(0, before.scoreCp - playedScore)));
      const severity = classifyLoss(lossCp);
      if (!severity) {
        continue;
      }

      candidates.push({
        dedupeKey: `${game.id}:${move.before}:${bestMoveUci}`,
        sourceName: `${platformLabel(game.sourcePlatform)} · ${game.sourceUsername}`,
        sourcePlatform: game.sourcePlatform,
        sourceUsername: game.sourceUsername,
        sourceGameId: game.id,
        gamePgn: game.pgn,
        gameHeaders: game.gameHeaders || JSON.stringify(parsed.headers),
        gameTitle: game.gameTitle,
        white: game.white,
        black: game.black,
        event: game.event,
        playedAt: game.playedAt,
        moveNumber: Math.floor(index / 2) + 1,
        ply: index + 1,
        side: move.color,
        previousMoveSan: parsed.moves[index - 1]?.san ?? "",
        previousMoveUci: parsed.moves[index - 1]
          ? moveToUci(parsed.moves[index - 1])
          : "",
        fenBefore: move.before,
        fenAfter: move.after,
        playedMoveSan: move.san,
        playedMoveUci,
        bestMoveSan: uciToSan(move.before, bestMoveUci),
        bestMoveUci,
        lossCp,
        severity,
      });
    }

    return candidates;
  }

  return (
    <main className="app-shell settings-page">
      <header className="topbar library-header">
        <div>
          <p className="eyebrow">Stockfish PGN Trainer</p>
          <h1>{copy.title}</h1>
          <p className="library-subtitle">{copy.subtitle}</p>
        </div>
        <div className="top-buttons">
          <Link className="secondary-button nav-button" href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.back}
          </Link>
          <Link className="secondary-button nav-button" href="/library">
            <Database size={16} aria-hidden="true" />
            {copy.library}
          </Link>
          <button
            type="button"
            className="icon-button language-button"
            onClick={() => setLocale((current) => (current === "zh" ? "en" : "zh"))}
            aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
          >
            <Languages size={16} aria-hidden="true" />
            <span>{locale === "zh" ? "EN" : "中"}</span>
          </button>
        </div>
      </header>

      <section className="library-summary" aria-label="import stats">
        <Stat label={copy.totalGames} value={stats.total} />
        <Stat label={copy.pendingGames} value={stats.pending} />
        <Stat label={copy.imported} value={progress.games} />
        <Stat label={copy.puzzles} value={progress.puzzles} />
      </section>

      <section className="settings-layout">
        <div className="panel settings-panel">
          <div className="result-head">
            <strong>{copy.status}</strong>
            {isBusy ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Settings size={17} />}
          </div>
          <div className="notice settings-notice" role="status">
            {message || copy.ready}
          </div>

          <div className="settings-grid">
            <label>
              <span>{copy.depth}</span>
              <input
                min={6}
                max={14}
                type="number"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              />
            </label>
            <label>
              <span>{copy.batch}</span>
              <input
                min={1}
                max={50}
                type="number"
                value={batchSize}
                onChange={(event) => setBatchSize(Number(event.target.value))}
              />
            </label>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => void loadGameStats()}
            disabled={isBusy}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {copy.status}
          </button>
        </div>

        <AccountPanel
          label={copy.chesscom}
          platform="chesscom"
          value={chessComUsername}
          disabled={isBusy}
          copy={copy}
          onChange={setChessComUsername}
          onValidate={validate}
          onSync={syncOnly}
          onImport={importAndAnalyze}
        />
        <AccountPanel
          label={copy.lichess}
          platform="lichess"
          value={lichessUsername}
          disabled={isBusy}
          copy={copy}
          onChange={setLichessUsername}
          onValidate={validate}
          onSync={syncOnly}
          onImport={importAndAnalyze}
        />
      </section>

      {isBusy ? (
        <button
          type="button"
          className="secondary-button stop-import-button"
          onClick={() => {
            cancelRef.current = true;
            setMessage(copy.stop);
          }}
        >
          <Square size={16} aria-hidden="true" />
          {copy.stop}
        </button>
      ) : null}

      <section className="panel settings-games-panel">
        <div className="result-head">
          <strong>{copy.recentGames}</strong>
          <span>{recentGames.length}</span>
        </div>
        {recentGames.length ? (
          <div className="settings-game-list">
            {recentGames.map((game) => (
              <article className="settings-game-row" key={game.id}>
                <span className="severity severity-inaccuracy">
                  {platformLabel(game.sourcePlatform)}
                </span>
                <strong>{game.gameTitle}</strong>
                <small>{game.playedAt || game.event}</small>
                <small>
                  {copy.side}: {game.userSide === "w" ? "White" : "Black"}
                </small>
                <small>
                  {game.puzzleGeneratedAt ? copy.generated : copy.pending}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Database size={18} aria-hidden="true" />
            {copy.noPending}
          </div>
        )}
      </section>
    </main>
  );
}

function AccountPanel({
  label,
  platform,
  value,
  disabled,
  copy,
  onChange,
  onValidate,
  onSync,
  onImport,
}: {
  label: string;
  platform: Platform;
  value: string;
  disabled: boolean;
  copy: Record<string, string>;
  onChange: (value: string) => void;
  onValidate: (platform: Platform) => void;
  onSync: (platform: Platform) => void;
  onImport: (platform: Platform) => void;
}) {
  return (
    <div className="panel settings-panel">
      <div className="panel-title compact-title">
        <div>
          <p>{platformLabel(platform)}</p>
          <strong>{label}</strong>
        </div>
        <CheckCircle2 size={18} aria-hidden="true" />
      </div>
      <input
        className="settings-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        disabled={disabled}
      />
      <div className="action-row">
        <button
          type="button"
          className="secondary-button"
          onClick={() => void onValidate(platform)}
          disabled={disabled}
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          {copy.validate}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void onSync(platform)}
          disabled={disabled}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {copy.sync}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => void onImport(platform)}
          disabled={disabled}
        >
          {disabled ? (
            <Loader2 className="spin" size={16} aria-hidden="true" />
          ) : (
            <Download size={16} aria-hidden="true" />
          )}
          {copy.importAnalyze}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
