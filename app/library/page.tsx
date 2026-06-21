"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Languages,
  Loader2,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";

type Locale = "zh" | "en";
type Severity = "inaccuracy" | "mistake" | "blunder";

type PuzzleRecord = {
  id: number;
  createdAt: string;
  sourceName: string;
  sourcePlatform: string;
  sourceUsername: string;
  sourceGameId: number | null;
  timeClass: string;
  gameTitle: string;
  white: string;
  black: string;
  event: string;
  playedAt: string;
  moveNumber: number;
  ply: number;
  side: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  playedMoveSan: string;
  playedMoveUci: string;
  bestMoveSan: string;
  bestMoveUci: string;
  lossCp: number;
  severity: Severity;
  attempts: number;
  solves: number;
  lastPracticedAt: string | null;
};

type PuzzleStats = {
  total: number;
  attempts: number;
  solves: number;
  averageLoss: number;
};

type GameRecord = {
  id: number;
  sourcePlatform: string;
  sourceUsername: string;
  gameTitle: string;
  white: string;
  black: string;
  playedAt: string;
  timeClass: string;
  analysisDepth: number;
  puzzleCount: number;
  puzzleGeneratedAt: string | null;
};

const COPY = {
  zh: {
    title: "题库管理",
    subtitle: "查看上传来源、日期、难度和练习记录；答案不在列表中显示。",
    back: "返回练习",
    settings: "用户设置",
    refresh: "刷新",
    delete: "删除",
    deleteSelected: "删除所选",
    filters: "筛选",
    all: "全部",
    timeClass: "时间类型",
    from: "开始日期",
    to: "结束日期",
    selected: "已选",
    total: "题目",
    attempts: "练习",
    accuracy: "命中",
    averageLoss: "均损",
    source: "来源",
    sourceAccount: "账号",
    uploaded: "上传日期",
    game: "棋局",
    side: "方",
    move: "手数",
    severity: "类型",
    loss: "损失",
    record: "记录",
    last: "最近练习",
    never: "未练习",
    empty: "题库为空",
    confirmDelete: "确定删除这道题吗？",
    loadFailed: "题库加载失败",
    deleteFailed: "删除失败",
  },
  en: {
    title: "Puzzle Library",
    subtitle: "Manage source, upload date, difficulty, and practice records. Answers stay hidden here.",
    back: "Back to practice",
    settings: "Settings",
    refresh: "Refresh",
    delete: "Delete",
    deleteSelected: "Delete selected",
    filters: "Filters",
    all: "All",
    timeClass: "Time class",
    from: "From",
    to: "To",
    selected: "Selected",
    total: "Puzzles",
    attempts: "Attempts",
    accuracy: "Accuracy",
    averageLoss: "Avg loss",
    source: "Source",
    sourceAccount: "Account",
    uploaded: "Uploaded",
    game: "Game",
    side: "Side",
    move: "Move",
    severity: "Type",
    loss: "Loss",
    record: "Record",
    last: "Last practiced",
    never: "Never",
    empty: "Library is empty",
    confirmDelete: "Delete this puzzle?",
    loadFailed: "Could not load library",
    deleteFailed: "Delete failed",
  },
} satisfies Record<Locale, Record<string, string>>;

const SEVERITY_LABELS: Record<Locale, Record<Severity, string>> = {
  zh: {
    inaccuracy: "疑问手",
    mistake: "错着",
    blunder: "大漏着",
  },
  en: {
    inaccuracy: "Inaccuracy",
    mistake: "Mistake",
    blunder: "Blunder",
  },
};

const SIDE_LABELS: Record<Locale, Record<"w" | "b", string>> = {
  zh: { w: "白", b: "黑" },
  en: { w: "White", b: "Black" },
};

function normalizeStats(stats: Partial<PuzzleStats> | null): PuzzleStats {
  return {
    total: Number(stats?.total ?? 0),
    attempts: Number(stats?.attempts ?? 0),
    solves: Number(stats?.solves ?? 0),
    averageLoss: Number(stats?.averageLoss ?? 0),
  };
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) {
    return COPY[locale].never;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function lossScoreLabel(cp: number) {
  const value = -Math.abs(Math.round(cp) / 100);
  return value.toFixed(1);
}

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export default function LibraryPage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [puzzles, setPuzzles] = useState<PuzzleRecord[]>([]);
  const [stats, setStats] = useState<PuzzleStats>({
    total: 0,
    attempts: 0,
    solves: 0,
    averageLoss: 0,
  });
  const [games, setGames] = useState<GameRecord[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [gameSearch, setGameSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [sourceFilter, setSourceFilter] = useState("all");
  const [timeClassFilter, setTimeClassFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [message, setMessage] = useState("");

  const copy = COPY[locale];
  const accuracy = useMemo(
    () => (stats.attempts ? `${Math.round((stats.solves / stats.attempts) * 100)}%` : "0%"),
    [stats.attempts, stats.solves]
  );

  const loadPuzzles = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        sourcePlatform: sourceFilter,
        timeClass: timeClassFilter,
      });
      if (fromDate) {
        params.set("from", fromDate.replace(/-/g, "."));
      }
      if (toDate) {
        params.set("to", toDate.replace(/-/g, "."));
      }
      if (selectedGameId) {
        params.set("sourceGameId", String(selectedGameId));
      }
      const response = await fetch(`/api/puzzles?${params}`);
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }

      const payload = (await response.json()) as {
        puzzles: PuzzleRecord[];
        stats: Partial<PuzzleStats>;
      };
      setPuzzles(payload.puzzles ?? []);
      setSelectedIds(new Set());
      setStats(normalizeStats(payload.stats));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [copy.loadFailed, fromDate, selectedGameId, sourceFilter, timeClassFilter, toDate]);

  const loadGames = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (gameSearch.trim()) {
        params.set("q", gameSearch.trim());
      }
      const response = await fetch(`/api/games?${params}`);
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }
      const payload = (await response.json()) as { games?: GameRecord[] };
      setGames(payload.games ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    }
  }, [copy.loadFailed, gameSearch]);

  async function deletePuzzle(id: number) {
    if (!window.confirm(copy.confirmDelete)) {
      return;
    }

    setDeletingId(id);
    setMessage("");

    try {
      const response = await fetch(`/api/puzzles/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }

      await loadPuzzles();
      await loadGames();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.size || !window.confirm(copy.confirmDelete)) {
      return;
    }

    setMessage("");
    try {
      const response = await fetch("/api/puzzles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }
      await loadPuzzles();
      await loadGames();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.deleteFailed);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadGames();
      void loadPuzzles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadGames, loadPuzzles]);

  const pageTitle =
    locale === "zh" ? "棋局及题目管理" : "Game and Puzzle Management";
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null;

  return (
    <main className="app-shell library-page">
      <header className="topbar library-header">
        <div>
          <p className="eyebrow">Stockfish PGN Trainer</p>
          <h1>{pageTitle}</h1>
          <p className="library-subtitle">{copy.subtitle}</p>
        </div>
        <div className="top-buttons">
          <Link className="secondary-button nav-button" href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.back}
          </Link>
          <Link className="secondary-button nav-button" href="/settings">
            <Settings size={16} aria-hidden="true" />
            {copy.settings}
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

      {message ? (
        <div className="notice" role="status">
          {message}
        </div>
      ) : null}

      <section className="library-summary" aria-label="library stats">
        <Stat label={copy.total} value={stats.total} />
        <Stat label={copy.attempts} value={stats.attempts} />
        <Stat label={copy.accuracy} value={accuracy} />
        <Stat label={copy.averageLoss} value={lossScoreLabel(stats.averageLoss)} />
      </section>

      <section className="panel library-panel game-management-panel">
        <div className="result-head">
          <strong>{locale === "zh" ? "棋局记录" : "Games"}</strong>
          <div className="library-actions">
            <input
              className="game-search-input"
              value={gameSearch}
              onChange={(event) => setGameSearch(event.target.value)}
              placeholder={locale === "zh" ? "搜索棋手、账号或棋局" : "Search games"}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadGames()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {copy.refresh}
            </button>
          </div>
        </div>

        {games.length ? (
          <div className="game-list">
            <button
              type="button"
              className={`game-row ${selectedGameId === null ? "active" : ""}`}
              onClick={() => setSelectedGameId(null)}
            >
              <strong>{copy.all}</strong>
              <span>{games.length}</span>
              <small>{locale === "zh" ? "显示全部题目" : "Show all puzzles"}</small>
            </button>
            {games.map((game) => (
              <article
                className={`game-row ${selectedGameId === game.id ? "active" : ""}`}
                key={game.id}
              >
                <button type="button" onClick={() => setSelectedGameId(game.id)}>
                  <strong>{game.gameTitle}</strong>
                  <span>
                    {game.timeClass || "Unknown"} · {formatDate(game.playedAt, locale)}
                  </span>
                  <small>
                    {game.sourcePlatform} / {game.sourceUsername || "PGN"} · d
                    {game.analysisDepth} · {game.puzzleCount}{" "}
                    {locale === "zh" ? "题" : "puzzles"}
                  </small>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Database size={20} aria-hidden="true" />
            {copy.empty}
          </div>
        )}
      </section>

      <section className="panel library-panel">
        <div className="result-head">
          <strong>
            {selectedGame
              ? `${locale === "zh" ? "当前棋局题目" : "Puzzles for"}: ${
                  selectedGame.gameTitle
                }`
              : copy.title}
          </strong>
          <div className="library-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void deleteSelected()}
              disabled={!selectedIds.size || isLoading}
            >
              <Trash2 size={16} aria-hidden="true" />
              {copy.deleteSelected} ({selectedIds.size})
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadPuzzles()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <RefreshCw size={16} aria-hidden="true" />
              )}
              {copy.refresh}
            </button>
          </div>
        </div>

        <div className="library-filter-grid">
          <label>
            <span>{copy.source}</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="all">{copy.all}</option>
              <option value="pgn">PGN</option>
              <option value="chesscom">Chess.com</option>
              <option value="lichess">Lichess</option>
              <option value="fide">FIDE</option>
            </select>
          </label>
          <label>
            <span>{copy.timeClass}</span>
            <select value={timeClassFilter} onChange={(event) => setTimeClassFilter(event.target.value)}>
              <option value="all">{copy.all}</option>
              <option value="">Unknown</option>
              <option value="bullet">Bullet</option>
              <option value="blitz">Blitz</option>
              <option value="rapid">Rapid</option>
              <option value="classical">Classical</option>
              <option value="correspondence">Correspondence</option>
            </select>
          </label>
          <label>
            <span>{copy.from}</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            <span>{copy.to}</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <Loader2 className="spin" size={20} aria-hidden="true" />
          </div>
        ) : puzzles.length ? (
          <div className="library-grid">
            {puzzles.map((puzzle) => (
              <article className="library-card" key={puzzle.id}>
                <div className="library-card-head">
                  <label className="library-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(puzzle.id)}
                      onChange={(event) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) {
                            next.add(puzzle.id);
                          } else {
                            next.delete(puzzle.id);
                          }
                          return next;
                        });
                      }}
                    />
                    <span className={severityClass(puzzle.severity)}>
                      {SEVERITY_LABELS[locale][puzzle.severity]}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="icon-button small danger-button"
                    onClick={() => void deletePuzzle(puzzle.id)}
                    disabled={deletingId === puzzle.id}
                    title={copy.delete}
                    aria-label={copy.delete}
                  >
                    {deletingId === puzzle.id ? (
                      <Loader2 className="spin" size={15} aria-hidden="true" />
                    ) : (
                      <Trash2 size={15} aria-hidden="true" />
                    )}
                  </button>
                </div>

                <h2>{puzzle.gameTitle}</h2>
                <div className="library-meta-grid">
                  <Meta label={copy.uploaded} value={formatDate(puzzle.createdAt, locale)} />
                  <Meta label={copy.source} value={puzzle.sourceName} />
                  <Meta label={copy.timeClass} value={puzzle.timeClass || "Unknown"} />
                  <Meta
                    label={copy.sourceAccount}
                    value={puzzle.sourceUsername || puzzle.sourcePlatform || "PGN"}
                  />
                  <Meta label={copy.game} value={`${puzzle.white} - ${puzzle.black}`} />
                  <Meta label={copy.side} value={SIDE_LABELS[locale][puzzle.side]} />
                  <Meta label={copy.move} value={String(puzzle.moveNumber)} />
                  <Meta label={copy.loss} value={lossScoreLabel(puzzle.lossCp)} />
                  <Meta label={copy.record} value={`${puzzle.solves}/${puzzle.attempts}`} />
                  <Meta label={copy.last} value={formatDate(puzzle.lastPracticedAt, locale)} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Database size={20} aria-hidden="true" />
            {copy.empty}
          </div>
        )}
      </section>
    </main>
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function severityClass(severity: Severity) {
  return `severity severity-${severity}`;
}
