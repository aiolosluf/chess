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

const COPY = {
  zh: {
    title: "题库管理",
    subtitle: "查看上传来源、日期、难度和练习记录；答案不在列表中显示。",
    back: "返回练习",
    settings: "用户设置",
    refresh: "刷新",
    delete: "删除",
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
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
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
      const response = await fetch("/api/puzzles");
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }

      const payload = (await response.json()) as {
        puzzles: PuzzleRecord[];
        stats: Partial<PuzzleStats>;
      };
      setPuzzles(payload.puzzles ?? []);
      setStats(normalizeStats(payload.stats));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [copy.loadFailed]);

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPuzzles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPuzzles]);

  return (
    <main className="app-shell library-page">
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

      <section className="panel library-panel">
        <div className="result-head">
          <strong>{copy.title}</strong>
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

        {isLoading ? (
          <div className="empty-state">
            <Loader2 className="spin" size={20} aria-hidden="true" />
          </div>
        ) : puzzles.length ? (
          <div className="library-grid">
            {puzzles.map((puzzle) => (
              <article className="library-card" key={puzzle.id}>
                <div className="library-card-head">
                  <span className={severityClass(puzzle.severity)}>
                    {SEVERITY_LABELS[locale][puzzle.severity]}
                  </span>
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
