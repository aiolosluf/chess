"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Chess, type Move } from "chess.js";
import {
  BookOpen,
  Brain,
  Check,
  Database,
  HelpCircle,
  Languages,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  ClipboardPaste,
  Upload,
  X,
} from "lucide-react";

type Locale = "zh" | "en";
type AnalyzeSide = "w" | "b" | "both";
type Severity = "inaccuracy" | "mistake" | "blunder";
type AnswerKind = "idle" | "checking" | "correct" | "better" | "wrong" | "repeat" | "worse";
type SquareName = Parameters<Chess["get"]>[0];

type ParsedGame = {
  pgn: string;
  headers: Record<string, string>;
  moves: Move[];
  label: string;
};

type AnalysisResult = {
  localId: string;
  dedupeKey: string;
  sourceName: string;
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

type PuzzleRecord = AnalysisResult & {
  id: number;
  createdAt: string;
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

type EngineAnalysis = {
  bestMove: string;
  scoreCp: number;
};

type EngineLine = {
  multipv: number;
  bestMove: string;
  scoreCp: number;
  depth?: number;
};

type AnalysisNode = {
  fen: string;
  san: string;
  from: string;
  to: string;
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  isMainLine: boolean;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const WORSE_MARGIN_CP = 15;
const PIECES: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  inaccuracy: "疑问手",
  mistake: "错着",
  blunder: "大漏着",
};

const SEVERITY_LABELS_EN: Record<Severity, string> = {
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

const SIDE_LABELS: Record<"w" | "b", string> = {
  w: "白方",
  b: "黑方",
};

const SIDE_LABELS_EN: Record<"w" | "b", string> = {
  w: "White",
  b: "Black",
};

const COPY = {
  zh: {
    title: "棋局复盘训练台",
    statsLabel: "题库统计",
    total: "题目",
    attempts: "练习",
    accuracy: "命中",
    averageLoss: "均损",
    library: "题库管理",
    reviewPage: "复盘上传",
    practicePage: "刷题",
    review: "复盘",
    uploadPgn: "上传 PGN",
    file: "文件",
    paste: "粘贴",
    pastePlaceholder: '粘贴 PGN，例如：[Event "Training"] ...',
    loadPgn: "载入 PGN",
    game: "棋局",
    depth: "深度",
    range: "范围",
    notLoaded: "未载入",
    first40: "前 40 手",
    first60: "前 60 手",
    first100: "前 100 手",
    all: "全部",
    both: "双方",
    white: "白方",
    black: "黑方",
    analyzeColor: "分析颜色",
    startAnalysis: "开始分析",
    stopAnalysis: "停止分析",
    candidates: "候选题",
    addToSet: "加入题集",
    noCandidates: "暂无候选题",
    practice: "刷题",
    randomPuzzle: "随机题",
    waitingLibrary: "题库等待中",
    noPuzzle: "无题目",
    findBestMove: "找出 Stockfish 推荐的更好走法",
    hintShown: "提示已显示：绿色格子是推荐走法",
    oldMove: "原局走法",
    opponentMove: "对手上一手",
    bestMove: "推荐走法",
    reviewTip: "答完后再看对比，把“想走的自然手”和“真正更强的手”分开记。",
    oldMistake: "旧错重现",
    oldMistakeTip: "这就是原局里走错的那步。不要急着看答案，先找一个更主动的替代手。",
    reviewLocked: "先独立找最佳着法；答对或点提示后再显示原局对比。",
    reviewEmpty: "加入题目后，这里会显示复盘对比。",
    randomOne: "随机一题",
    hint: "显示提示",
    reset: "重置本题",
    ok: "确定",
    retry: "重试",
    next: "下一题",
    reviewGame: "回顾棋局",
    closeAnalysis: "关闭分析",
    engineAnalysis: "引擎分析",
    engineLines: "候选走法",
    gameRecord: "棋谱记录",
    freeBoard: "自由分析棋盘",
    loadingEngine: "引擎分析中",
    evaluating: "正在比较这步棋和原局错招...",
    correct: "答对",
    brilliantBest: "太棒了，最佳走法！",
    improved: "比以前棒，但还可以更好",
    worse: "怎么还不如以前了！",
    repeated: "你之前就是这么错的",
    thinkAgain: "再想一下，刚才是",
    illegal: "这步棋不合法",
    emptyLibrary: "题库为空",
  },
  en: {
    title: "Chess Review Trainer",
    statsLabel: "Puzzle stats",
    total: "Puzzles",
    attempts: "Attempts",
    accuracy: "Accuracy",
    averageLoss: "Avg loss",
    library: "Library",
    reviewPage: "Review upload",
    practicePage: "Practice",
    review: "Review",
    uploadPgn: "Upload PGN",
    file: "File",
    paste: "Paste",
    pastePlaceholder: 'Paste PGN, e.g. [Event "Training"] ...',
    loadPgn: "Load PGN",
    game: "Game",
    depth: "Depth",
    range: "Range",
    notLoaded: "Not loaded",
    first40: "First 40 plies",
    first60: "First 60 plies",
    first100: "First 100 plies",
    all: "All",
    both: "Both",
    white: "White",
    black: "Black",
    analyzeColor: "Side to analyze",
    startAnalysis: "Analyze",
    stopAnalysis: "Stop analysis",
    candidates: "Candidates",
    addToSet: "Add to set",
    noCandidates: "No candidates",
    practice: "Practice",
    randomPuzzle: "Random puzzle",
    waitingLibrary: "Waiting for puzzles",
    noPuzzle: "No puzzle",
    findBestMove: "Find Stockfish's better move",
    hintShown: "Hint shown: green squares mark the recommended move",
    oldMove: "Game move",
    opponentMove: "Opponent's last move",
    bestMove: "Best move",
    reviewTip: "Compare only after answering, so the natural move and the stronger move stay separate.",
    oldMistake: "Same old mistake",
    oldMistakeTip: "That is exactly the move from the original game. Pause and look for a more active alternative.",
    reviewLocked: "Solve first; the comparison appears after a correct answer or a hint.",
    reviewEmpty: "After adding puzzles, the comparison will appear here.",
    randomOne: "Random",
    hint: "Show hint",
    reset: "Reset",
    ok: "OK",
    retry: "Retry",
    next: "Next",
    reviewGame: "Review game",
    closeAnalysis: "Close analysis",
    engineAnalysis: "Engine analysis",
    engineLines: "Candidate moves",
    gameRecord: "Game record",
    freeBoard: "Free analysis board",
    loadingEngine: "Engine analyzing",
    evaluating: "Comparing this move with the original mistake...",
    correct: "Correct",
    brilliantBest: "Excellent, best move!",
    improved: "Better than before, but there is still a stronger move",
    worse: "This is even worse than before!",
    repeated: "This is the exact old mistake",
    thinkAgain: "Think again. You played",
    illegal: "That move is illegal",
    emptyLibrary: "Library is empty",
  },
} satisfies Record<Locale, Record<string, string>>;

function splitPgnGames(text: string) {
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

function parsePgnGame(pgn: string): ParsedGame | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false });
    const moves = chess.history({ verbose: true });
    const headers = chess.getHeaders();
    const white = headers.White || "White";
    const black = headers.Black || "Black";
    const event = headers.Event || "Training";
    const date = headers.Date || "";

    if (!moves.length) {
      return null;
    }

    return {
      pgn,
      headers,
      moves,
      label: `${white} - ${black}${date ? ` · ${date}` : ""} · ${event}`,
    };
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

  if (lossCp >= 70) {
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
        Math.max(18000, depth * 2500)
      );
      const bestMove = bestLine.split(/\s+/)[1] ?? "";
      return { bestMove, scoreCp };
    } finally {
      this.listeners.delete(onInfo);
      this.busy = false;
    }
  }

  async analyzeFenLines(fen: string, depth: number, lines = 3): Promise<{
    lines: EngineLine[];
    scoreCp: number;
  }> {
    await this.ensureReady();

    while (this.busy) {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }

    this.busy = true;
    const lineMap = new Map<number, EngineLine>();

    const onInfo = (line: string) => {
      if (!line.startsWith("info ") || !line.includes(" pv ")) {
        return;
      }

      const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? "1");
      const infoDepth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? "0");
      const parsed = parseScore(line);
      const pv = line.match(/\bpv\s+(.+)$/)?.[1]?.split(/\s+/)[0];

      if (parsed !== null && pv) {
        lineMap.set(multipv, {
          multipv,
          bestMove: pv,
          scoreCp: parsed,
          depth: infoDepth || undefined,
        });
      }
    };

    try {
      this.listeners.add(onInfo);
      this.post(`setoption name MultiPV value ${lines}`);
      this.post("isready");
      await this.waitForLine((line) => line === "readyok", 12000);
      this.post("ucinewgame");
      this.post(`position fen ${fen}`);
      this.post(`go depth ${depth}`);
      await this.waitForLine(
        (line) => line.startsWith("bestmove "),
        Math.max(18000, depth * 2500)
      );
      const sorted = [...lineMap.values()].sort((a, b) => a.multipv - b.multipv);
      return {
        lines: sorted,
        scoreCp: sorted[0]?.scoreCp ?? 0,
      };
    } finally {
      this.post("setoption name MultiPV value 1");
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
      this.worker.onerror = () => {
        throw new Error("Stockfish 加载失败");
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

  private waitForLine(
    matcher: (line: string) => boolean,
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
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

function normalizeStats(stats: Partial<PuzzleStats> | null): PuzzleStats {
  return {
    total: Number(stats?.total ?? 0),
    attempts: Number(stats?.attempts ?? 0),
    solves: Number(stats?.solves ?? 0),
    averageLoss: Number(stats?.averageLoss ?? 0),
  };
}

function makeGameTitle(headers: Record<string, string>) {
  return `${headers.White || "White"} - ${headers.Black || "Black"}`;
}

function severityClass(severity: Severity) {
  return `severity severity-${severity}`;
}

function signedScoreLabel(cp: number) {
  const value = Math.round(cp) / 100;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function lossScoreLabel(cp: number) {
  const value = -Math.abs(Math.round(cp) / 100);
  return value.toFixed(1);
}

function evalPercent(cp: number) {
  const clamped = Math.max(-900, Math.min(900, cp));
  return Math.round(50 + (clamped / 900) * 50);
}

function analysisNodesFromPgn(pgn: string, fallbackFen: string): AnalysisNode[] {
  if (!pgn) {
    return [
      {
        fen: fallbackFen,
        san: "",
        from: "",
        to: "",
        ply: 0,
        moveNumber: 0,
        color: "w",
        isMainLine: true,
      },
    ];
  }

  try {
    const game = new Chess();
    game.loadPgn(pgn, { strict: false });
    const history = game.history({ verbose: true });
    const startFen = history[0]?.before ?? fallbackFen;

    return [
      {
        fen: startFen,
        san: "",
        from: "",
        to: "",
        ply: 0,
        moveNumber: 0,
        color: "w",
        isMainLine: true,
      },
      ...history.map((move, index) => ({
        fen: move.after,
        san: move.san,
        from: move.from,
        to: move.to,
        ply: index + 1,
        moveNumber: Math.floor(index / 2) + 1,
        color: move.color,
        isMainLine: true,
      })),
    ];
  } catch {
    return [
      {
        fen: fallbackFen,
        san: "",
        from: "",
        to: "",
        ply: 0,
        moveNumber: 0,
        color: "w",
        isMainLine: true,
      },
    ];
  }
}

function asSquare(square: string) {
  return square as SquareName;
}

function apiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh");
  const copy = COPY[locale];
  const severityLabels = locale === "zh" ? SEVERITY_LABELS : SEVERITY_LABELS_EN;
  const sideLabels = locale === "zh" ? SIDE_LABELS : SIDE_LABELS_EN;
  const [fileName, setFileName] = useState("");
  const [view, setView] = useState<"practice" | "review">("practice");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pastedPgn, setPastedPgn] = useState("");
  const [parsedGames, setParsedGames] = useState<ParsedGame[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [analyzeSide, setAnalyzeSide] = useState<AnalyzeSide>("both");
  const [depth, setDepth] = useState(10);
  const [halfMoveLimit, setHalfMoveLimit] = useState("60");
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("等待 PGN");
  const [analysisProgress, setAnalysisProgress] = useState({ done: 0, total: 0 });
  const [, setPuzzles] = useState<PuzzleRecord[]>([]);
  const [stats, setStats] = useState<PuzzleStats>({
    total: 0,
    attempts: 0,
    solves: 0,
    averageLoss: 0,
  });
  const [activePuzzle, setActivePuzzle] = useState<PuzzleRecord | null>(null);
  const [boardFen, setBoardFen] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [answerState, setAnswerState] = useState<{
    kind: AnswerKind;
    text: string;
    detail?: string;
  }>({ kind: "idle", text: "随机题准备中" });
  const [analysisPuzzle, setAnalysisPuzzle] = useState<PuzzleRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPuzzle, setIsLoadingPuzzle] = useState(false);
  const [message, setMessage] = useState("");

  const engineRef = useRef<BrowserStockfish | null>(null);
  const cancelAnalysisRef = useRef(false);

  const selectedGame = parsedGames[selectedGameIndex] ?? null;
  const targetCount = useMemo(() => {
    if (!selectedGame) {
      return 0;
    }

    const maxPly =
      halfMoveLimit === "all" ? Number.POSITIVE_INFINITY : Number(halfMoveLimit);

    return selectedGame.moves.filter((move, index) => {
      const sideMatches = analyzeSide === "both" || move.color === analyzeSide;
      return sideMatches && index + 1 <= maxPly;
    }).length;
  }, [analyzeSide, halfMoveLimit, selectedGame]);

  const selectedResults = useMemo(
    () =>
      analysisResults.filter((result) => selectedResultIds.has(result.localId)),
    [analysisResults, selectedResultIds]
  );

  const answerHighlight = useMemo(() => {
    if (!activePuzzle) {
      return null;
    }

    if (!showHint && answerState.kind !== "correct") {
      return null;
    }

    return {
      from: activePuzzle.bestMoveUci.slice(0, 2),
      to: activePuzzle.bestMoveUci.slice(2, 4),
    };
  }, [activePuzzle, answerState.kind, showHint]);

  const legalTargets = useMemo(() => {
    if (!activePuzzle || !selectedSquare || answerState.kind !== "idle") {
      return new Set<string>();
    }

    try {
      const chess = new Chess(activePuzzle.fenBefore);
      const moves = chess.moves({
        square: asSquare(selectedSquare),
        verbose: true,
      });
      return new Set(moves.map((move) => move.to));
    } catch {
      return new Set<string>();
    }
  }, [activePuzzle, answerState.kind, selectedSquare]);

  const mistakeHighlight = useMemo(() => {
    if (!activePuzzle || answerState.kind !== "repeat") {
      return null;
    }

    return {
      from: activePuzzle.playedMoveUci.slice(0, 2),
      to: activePuzzle.playedMoveUci.slice(2, 4),
    };
  }, [activePuzzle, answerState.kind]);

  const previousMoveHighlight = useMemo(() => {
    if (!activePuzzle?.previousMoveUci) {
      return null;
    }

    return {
      from: activePuzzle.previousMoveUci.slice(0, 2),
      to: activePuzzle.previousMoveUci.slice(2, 4),
    };
  }, [activePuzzle]);

  const reviewUnlocked =
    Boolean(activePuzzle) && (showHint || answerState.kind === "correct");

  function activatePuzzle(puzzle: PuzzleRecord | null) {
    setActivePuzzle(puzzle);
    setBoardFen(puzzle?.fenBefore ?? "");
    setSelectedSquare(null);
    setShowHint(false);
    setAnswerState(
      puzzle
        ? { kind: "idle", text: copy.findBestMove }
        : { kind: "idle", text: copy.emptyLibrary }
    );
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitialPuzzles() {
      try {
        const response = await fetch("/api/puzzles");
        if (!response.ok) {
          throw new Error(await readJsonError(response));
        }

        const payload = (await response.json()) as {
          puzzles: PuzzleRecord[];
          stats: Partial<PuzzleStats>;
        };

        if (!mounted) {
          return;
        }

        setPuzzles(payload.puzzles ?? []);
        setStats(normalizeStats(payload.stats));

        if (payload.puzzles?.length) {
          const randomResponse = await fetch("/api/puzzles/random");
          if (!randomResponse.ok) {
            throw new Error(await readJsonError(randomResponse));
          }

          const randomPayload = (await randomResponse.json()) as {
            puzzle: PuzzleRecord | null;
          };

          if (mounted && randomPayload.puzzle) {
            setActivePuzzle(randomPayload.puzzle);
            setBoardFen(randomPayload.puzzle.fenBefore);
            setSelectedSquare(null);
            setShowHint(false);
            setAnswerState({
              kind: "idle",
              text: COPY.zh.findBestMove,
            });
          }
        }
      } catch (error) {
        if (mounted) {
          setMessage(apiErrorMessage(error));
        }
      }
    }

    void loadInitialPuzzles();

    return () => {
      mounted = false;
      engineRef.current?.dispose();
    };
  }, []);

  async function loadPuzzles() {
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

      if (!activePuzzle && payload.puzzles?.length) {
        await loadRandomPuzzle();
      }
    } catch (error) {
      setMessage(apiErrorMessage(error));
    }
  }

  async function loadRandomPuzzle() {
    setIsLoadingPuzzle(true);
    setMessage("");

    try {
      const response = await fetch("/api/puzzles/random");
      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }

      const payload = (await response.json()) as { puzzle: PuzzleRecord | null };
      activatePuzzle(payload.puzzle);

      if (!payload.puzzle) {
        setAnswerState({ kind: "idle", text: "题库为空" });
      }
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  function loadPgnText(text: string, sourceName: string) {
    const games = splitPgnGames(text)
      .map(parsePgnGame)
      .filter((game): game is ParsedGame => game !== null);

    setFileName(sourceName);
    setParsedGames(games);
    setSelectedGameIndex(0);
    setAnalysisResults([]);
    setSelectedResultIds(new Set());
    setAnalysisProgress({ done: 0, total: 0 });
    setAnalysisStatus(games.length ? `读到 ${games.length} 盘棋` : "PGN 未识别");
    setMessage(games.length ? "" : "这个 PGN 没有读到合法棋局");
  }

  async function handleFiles(files: FileList | File[]) {
    const file = files[0];
    if (!file) {
      return;
    }

    loadPgnText(await file.text(), file.name);
  }

  function loadPastedPgn() {
    loadPgnText(pastedPgn, "手动粘贴 PGN");
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void handleFiles(event.target.files);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }

  function stopAnalysis() {
    cancelAnalysisRef.current = true;
    setAnalysisStatus("正在停止");
  }

  async function runAnalysis() {
    if (!selectedGame || isAnalyzing) {
      return;
    }

    setMessage("");
    setIsAnalyzing(true);
    cancelAnalysisRef.current = false;
    setAnalysisResults([]);
    setSelectedResultIds(new Set());
    setAnalysisProgress({ done: 0, total: targetCount });

    const maxPly =
      halfMoveLimit === "all" ? Number.POSITIVE_INFINITY : Number(halfMoveLimit);
    const targets = selectedGame.moves
      .map((move, index) => ({ move, index }))
      .filter(({ move, index }) => {
        const sideMatches = analyzeSide === "both" || move.color === analyzeSide;
        return sideMatches && index + 1 <= maxPly;
      });

    const headers = selectedGame.headers;
    const sourceName = fileName || "PGN";
    const white = headers.White || "White";
    const black = headers.Black || "Black";
    const gameTitle = makeGameTitle(headers);
    const event = headers.Event || "Training";
    const playedAt = headers.Date || "";
    const found: AnalysisResult[] = [];

    try {
      engineRef.current ??= new BrowserStockfish();

      for (let i = 0; i < targets.length; i += 1) {
        if (cancelAnalysisRef.current) {
          break;
        }

        const { move, index } = targets[i];
        const moveNumber = Math.floor(index / 2) + 1;
        setAnalysisStatus(
          `${sideLabels[move.color]} ${moveNumber}.${move.color === "b" ? ".." : ""} ${move.san}`
        );

        const before = await engineRef.current.analyzeFen(move.before, depth);
        const after = await engineRef.current.analyzeFen(
          move.after,
          Math.max(6, depth - 1)
        );
        const playedScore = -after.scoreCp;
        const rawLoss = before.scoreCp - playedScore;
        const lossCp = Math.round(Math.min(2000, Math.max(0, rawLoss)));
        const severity = classifyLoss(lossCp);
        const bestMoveUci = before.bestMove.toLowerCase();
        const playedMoveUci = moveToUci(move);

        if (
          severity &&
          bestMoveUci &&
          bestMoveUci !== "(none)" &&
          bestMoveUci !== playedMoveUci
        ) {
          const previousMove = selectedGame.moves[index - 1];
          const bestMoveSan = uciToSan(move.before, bestMoveUci);
          found.push({
            localId: `${Date.now()}-${index}-${bestMoveUci}`,
            dedupeKey: `${move.before}|${bestMoveUci}`,
            sourceName,
            gamePgn: selectedGame.pgn,
            gameHeaders: JSON.stringify(headers),
            gameTitle,
            white,
            black,
            event,
            playedAt,
            moveNumber,
            ply: index + 1,
            side: move.color,
            previousMoveSan: previousMove?.san ?? "",
            previousMoveUci: previousMove ? moveToUci(previousMove) : "",
            fenBefore: move.before,
            fenAfter: move.after,
            playedMoveSan: move.san,
            playedMoveUci,
            bestMoveSan,
            bestMoveUci,
            lossCp,
            severity,
          });

          setAnalysisResults([...found]);
          setSelectedResultIds(new Set(found.map((result) => result.localId)));
        }

        setAnalysisProgress({ done: i + 1, total: targets.length });
      }

      setAnalysisStatus(
        cancelAnalysisRef.current ? "已停止" : `找到 ${found.length} 个可练题`
      );
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setAnalysisStatus("分析失败");
    } finally {
      setIsAnalyzing(false);
      cancelAnalysisRef.current = false;
    }
  }

  async function saveSelectedResults() {
    if (!selectedResults.length) {
      setMessage("先勾选要加入题集的局面");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzles: selectedResults }),
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }

      const payload = (await response.json()) as { saved: number; skipped?: number };
      setMessage(`已加入 ${payload.saved} 题${payload.skipped ? `，跳过重复 ${payload.skipped} 题` : ""}`);
      await loadPuzzles();
      await loadRandomPuzzle();
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function recordAttempt(correct: boolean) {
    if (!activePuzzle) {
      return;
    }

    try {
      const response = await fetch(`/api/puzzles/${activePuzzle.id}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correct }),
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response));
      }

      const payload = (await response.json()) as { puzzle: PuzzleRecord };
      if (payload.puzzle) {
        setActivePuzzle(payload.puzzle);
      }
      await loadPuzzles();
    } catch (error) {
      setMessage(apiErrorMessage(error));
    }
  }

  async function attemptPuzzleMove(from: string, to: string) {
    if (!activePuzzle || answerState.kind !== "idle") {
      return;
    }
    const puzzle = activePuzzle;
    const chess = new Chess(puzzle.fenBefore);

    try {
      const move = chess.move({
        from,
        to,
        promotion: "q",
      });
      const uci = moveToUci(move);
      const correct = uci === puzzle.bestMoveUci;
      const repeatedOldMistake = !correct && uci === puzzle.playedMoveUci;

      setBoardFen(chess.fen());
      setSelectedSquare(null);

      if (correct) {
        setShowHint(true);
        setAnswerState({
          kind: "correct",
          text: copy.brilliantBest,
          detail: `${copy.bestMove}: ${puzzle.bestMoveSan}`,
        });
        await recordAttempt(true);
        return;
      }

      if (repeatedOldMistake) {
        setShowHint(false);
        setAnswerState({
          kind: "repeat",
          text: `${copy.repeated}: ${move.san}`,
        });
        await recordAttempt(false);
        return;
      }

      setShowHint(false);
      setAnswerState({
        kind: "checking",
        text: copy.evaluating,
      });

      engineRef.current ??= new BrowserStockfish();
      const before = await engineRef.current.analyzeFen(
        puzzle.fenBefore,
        Math.max(8, Math.min(depth, 12))
      );
      const after = await engineRef.current.analyzeFen(
        chess.fen(),
        Math.max(6, Math.min(depth - 1, 10))
      );
      const userLoss = Math.round(
        Math.min(2000, Math.max(0, before.scoreCp - -after.scoreCp))
      );
      const detail = `${copy.oldMove}: ${lossScoreLabel(puzzle.lossCp)} · ${move.san}: ${lossScoreLabel(userLoss)}`;

      if (userLoss <= puzzle.lossCp + WORSE_MARGIN_CP) {
        setAnswerState({
          kind: "better",
          text: copy.improved,
          detail,
        });
      } else {
        setAnswerState({
          kind: "worse",
          text: copy.worse,
          detail,
        });
      }

      await recordAttempt(false);
    } catch {
      setAnswerState({ kind: "wrong", text: copy.illegal });
      setSelectedSquare(null);
    }
  }

  async function handleBoardClick(square: string) {
    if (!activePuzzle || answerState.kind !== "idle") {
      return;
    }

    const chess = new Chess(activePuzzle.fenBefore);
    const piece = chess.get(asSquare(square));

    if (!selectedSquare) {
      if (piece?.color === activePuzzle.side) {
        setSelectedSquare(square);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (piece?.color === activePuzzle.side) {
      setSelectedSquare(square);
      return;
    }

    await attemptPuzzleMove(selectedSquare, square);
  }

  function clearAnswerFeedback() {
    if (activePuzzle) {
      setBoardFen(activePuzzle.fenBefore);
    }

    setSelectedSquare(null);
    setShowHint(false);
    setAnswerState({
      kind: "idle",
      text: activePuzzle ? copy.findBestMove : copy.emptyLibrary,
    });
  }

  function toggleResult(localId: string) {
    setSelectedResultIds((current) => {
      const next = new Set(current);
      if (next.has(localId)) {
        next.delete(localId);
      } else {
        next.add(localId);
      }
      return next;
    });
  }

  const progressPercent =
    analysisProgress.total > 0
      ? Math.round((analysisProgress.done / analysisProgress.total) * 100)
      : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Stockfish PGN Trainer</p>
          <h1>{copy.title}</h1>
        </div>
        <div className="top-actions">
          <div className="top-stats" aria-label={copy.statsLabel}>
            <Stat label={copy.total} value={stats.total} />
            <Stat label={copy.attempts} value={stats.attempts} />
            <Stat
              label={copy.accuracy}
              value={
                stats.attempts ? `${Math.round((stats.solves / stats.attempts) * 100)}%` : "0%"
              }
            />
            <Stat label={copy.averageLoss} value={lossScoreLabel(stats.averageLoss)} />
          </div>
          <div className="top-buttons">
            <Link className="secondary-button nav-button" href="/library">
              <BookOpen size={16} aria-hidden="true" />
              {copy.library}
            </Link>
            <button
              type="button"
              className="icon-button language-button"
              onClick={() => setLocale((current) => (current === "zh" ? "en" : "zh"))}
              title={locale === "zh" ? "Switch to English" : "切换到中文"}
              aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
            >
              <Languages size={16} aria-hidden="true" />
              <span>{locale === "zh" ? "EN" : "中"}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="directory-bar" aria-label="目录">
        <button
          type="button"
          className={view === "practice" ? "active" : ""}
          onClick={() => setView("practice")}
        >
          <Shuffle size={16} aria-hidden="true" />
          {copy.practicePage}
        </button>
        <button
          type="button"
          className={view === "review" ? "active" : ""}
          onClick={() => setView("review")}
        >
          <Brain size={16} aria-hidden="true" />
          {copy.reviewPage}
        </button>
        <Link href="/library">
          <BookOpen size={16} aria-hidden="true" />
          {copy.library}
        </Link>
      </nav>

      {message ? (
        <div className="notice" role="status">
          {message}
        </div>
      ) : null}

      <section className="workspace single-view">
        {view === "review" ? (
        <section className="panel analysis-panel">
          <div className="panel-title">
            <div>
              <p>{copy.review}</p>
              <strong>{fileName || "PGN"}</strong>
            </div>
            <Brain size={22} aria-hidden="true" />
          </div>

          <div className="input-tabs" aria-label="PGN 输入方式">
            <button
              type="button"
              className={inputMode === "file" ? "active" : ""}
              onClick={() => setInputMode("file")}
            >
              <Upload size={16} aria-hidden="true" />
              {copy.file}
            </button>
            <button
              type="button"
              className={inputMode === "paste" ? "active" : ""}
              onClick={() => setInputMode("paste")}
            >
              <ClipboardPaste size={16} aria-hidden="true" />
              {copy.paste}
            </button>
          </div>

          {inputMode === "file" ? (
            <label
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload size={22} aria-hidden="true" />
              <span>{copy.uploadPgn}</span>
              <input
                type="file"
                accept=".pgn,text/plain"
                onChange={handleFileInput}
                aria-label="上传 PGN 文件"
              />
            </label>
          ) : (
            <div className="paste-box">
              <textarea
                value={pastedPgn}
                onChange={(event) => setPastedPgn(event.target.value)}
                placeholder={copy.pastePlaceholder}
                aria-label="粘贴 PGN 文本"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={loadPastedPgn}
                disabled={!pastedPgn.trim()}
              >
                <ClipboardPaste size={16} aria-hidden="true" />
                {copy.loadPgn}
              </button>
            </div>
          )}

          <div className="control-grid">
            <label>
              <span>{copy.game}</span>
              <select
                value={selectedGameIndex}
                onChange={(event) => setSelectedGameIndex(Number(event.target.value))}
              >
                {parsedGames.length ? (
                  parsedGames.map((game, index) => (
                    <option value={index} key={`${game.label}-${index}`}>
                      {game.label}
                    </option>
                  ))
                ) : (
                  <option>{copy.notLoaded}</option>
                )}
              </select>
            </label>

            <label>
              <span>{copy.depth}</span>
              <select
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                {[8, 10, 12, 14].map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{copy.range}</span>
              <select
                value={halfMoveLimit}
                onChange={(event) => setHalfMoveLimit(event.target.value)}
              >
                <option value="40">{copy.first40}</option>
                <option value="60">{copy.first60}</option>
                <option value="100">{copy.first100}</option>
                <option value="all">{copy.all}</option>
              </select>
            </label>
          </div>

          <div className="segmented" aria-label={copy.analyzeColor}>
            {[
              ["both", copy.both],
              ["w", copy.white],
              ["b", copy.black],
            ].map(([value, label]) => (
              <button
                type="button"
                className={analyzeSide === value ? "active" : ""}
                onClick={() => setAnalyzeSide(value as AnalyzeSide)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              onClick={runAnalysis}
              disabled={!selectedGame || isAnalyzing || targetCount === 0}
            >
              {isAnalyzing ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : (
                <Search size={18} aria-hidden="true" />
              )}
              {copy.startAnalysis}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={stopAnalysis}
              disabled={!isAnalyzing}
              title={copy.stopAnalysis}
              aria-label={copy.stopAnalysis}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="progress-block">
            <div>
              <span>{analysisStatus}</span>
              <span>
                {analysisProgress.done}/{analysisProgress.total || targetCount}
              </span>
            </div>
            <div className="progress-track">
              <div style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="result-head">
            <strong>{copy.candidates}</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={saveSelectedResults}
              disabled={!selectedResults.length || isSaving}
            >
              {isSaving ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Plus size={16} aria-hidden="true" />
              )}
              {copy.addToSet}
            </button>
          </div>

          <div className="mistake-list">
            {analysisResults.length ? (
              analysisResults.map((result) => (
                <label className="mistake-row" key={result.localId}>
                  <input
                    type="checkbox"
                    checked={selectedResultIds.has(result.localId)}
                    onChange={() => toggleResult(result.localId)}
                    aria-label={`选择 ${result.bestMoveSan}`}
                  />
                  <span className={severityClass(result.severity)}>
                    {severityLabels[result.severity]}
                  </span>
                  <span className="move-cell">
                    {result.moveNumber}. {result.playedMoveSan}
                  </span>
                  <span className="best-cell">{result.bestMoveSan}</span>
                  <span className="loss-cell">{lossScoreLabel(result.lossCp)}</span>
                </label>
              ))
            ) : (
              <div className="empty-state">{copy.noCandidates}</div>
            )}
          </div>
        </section>
        ) : null}

        {view === "practice" ? (
        <section className="panel practice-panel">
          <div className="panel-title">
            <div>
              <p>{copy.practice}</p>
              <strong>
                {activePuzzle
                  ? `${sideLabels[activePuzzle.side]} ${activePuzzle.moveNumber}`
                  : copy.randomPuzzle}
              </strong>
            </div>
            <Database size={22} aria-hidden="true" />
          </div>

          <ChessBoard
            fen={boardFen}
            orientation={activePuzzle?.side ?? "w"}
            activeSide={activePuzzle?.side ?? "w"}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            answerHighlight={answerHighlight}
            mistakeHighlight={mistakeHighlight}
            previousMoveHighlight={previousMoveHighlight}
            onSquareClick={(square) => void handleBoardClick(square)}
            onMove={(from, to) => void attemptPuzzleMove(from, to)}
          />

          <div className={`answer-banner answer-${answerState.kind}`}>
            <span>
              {answerState.text}
              {answerState.detail ? <small>{answerState.detail}</small> : null}
            </span>
            {answerState.kind === "correct" ? (
              <div className="answer-actions">
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={() => activePuzzle && setAnalysisPuzzle(activePuzzle)}
                >
                  <Search size={15} aria-hidden="true" />
                  {copy.reviewGame}
                </button>
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={() => void loadRandomPuzzle()}
                >
                  <Shuffle size={15} aria-hidden="true" />
                  {copy.next}
                </button>
              </div>
            ) : answerState.kind === "better" ? (
              <div className="answer-actions">
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={() => activePuzzle && setAnalysisPuzzle(activePuzzle)}
                >
                  <Search size={15} aria-hidden="true" />
                  {copy.reviewGame}
                </button>
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={clearAnswerFeedback}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {copy.retry}
                </button>
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={() => void loadRandomPuzzle()}
                >
                  <Shuffle size={15} aria-hidden="true" />
                  {copy.next}
                </button>
              </div>
            ) : answerState.kind !== "idle" && answerState.kind !== "checking" ? (
              <div className="answer-actions">
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={() => activePuzzle && setAnalysisPuzzle(activePuzzle)}
                >
                  <Search size={15} aria-hidden="true" />
                  {copy.reviewGame}
                </button>
                <button
                  type="button"
                  className="answer-confirm"
                  onClick={clearAnswerFeedback}
                >
                  <Check size={15} aria-hidden="true" />
                  {answerState.kind === "wrong" || answerState.kind === "worse" ? copy.retry : copy.ok}
                </button>
              </div>
            ) : null}
          </div>

          <div className="puzzle-meta">
            <span>{activePuzzle?.gameTitle ?? copy.waitingLibrary}</span>
            <span>
              {activePuzzle?.previousMoveSan
                ? `${copy.opponentMove}: ${activePuzzle.previousMoveSan}`
                : activePuzzle
                ? `${severityLabels[activePuzzle.severity]} · ${lossScoreLabel(activePuzzle.lossCp)}`
                : copy.noPuzzle}
            </span>
          </div>

          <div
            className={[
              "review-card",
              reviewUnlocked ? "open" : "",
              answerState.kind === "repeat" ? "repeat" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {activePuzzle ? (
              reviewUnlocked ? (
                <>
                  <div>
                    <span>{copy.oldMove}</span>
                    <strong>{activePuzzle.playedMoveSan}</strong>
                  </div>
                  <div>
                    <span>{copy.bestMove}</span>
                    <strong>{activePuzzle.bestMoveSan}</strong>
                  </div>
                  <p>{copy.reviewTip}</p>
                </>
              ) : answerState.kind === "repeat" ? (
                <>
                  <div>
                    <span>{copy.oldMistake}</span>
                    <strong>{activePuzzle.playedMoveSan}</strong>
                  </div>
                  <p>{copy.oldMistakeTip}</p>
                </>
              ) : (
                <p>{copy.reviewLocked}</p>
              )
            ) : (
              <p>{copy.reviewEmpty}</p>
            )}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              onClick={loadRandomPuzzle}
              disabled={isLoadingPuzzle}
            >
              {isLoadingPuzzle ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : (
                <Shuffle size={18} aria-hidden="true" />
              )}
              {copy.randomOne}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                if (activePuzzle) {
                  setShowHint(true);
                  setAnswerState({
                    kind: "idle",
                    text: copy.hintShown,
                  });
                }
              }}
              disabled={!activePuzzle}
              title={copy.hint}
              aria-label={copy.hint}
            >
              <HelpCircle size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                if (activePuzzle) {
                  setBoardFen(activePuzzle.fenBefore);
                  setAnswerState({
                    kind: "idle",
                    text: copy.findBestMove,
                  });
                  setSelectedSquare(null);
                  setShowHint(false);
                }
              }}
              disabled={!activePuzzle}
              title={copy.reset}
              aria-label={copy.reset}
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
            <Link className="secondary-button nav-button" href="/library">
              <BookOpen size={16} aria-hidden="true" />
              {copy.library}
            </Link>
          </div>
        </section>
        ) : null}
      </section>

      {analysisPuzzle ? (
        <AnalysisPanel
          puzzle={analysisPuzzle}
          copy={copy}
          onClose={() => setAnalysisPuzzle(null)}
        />
      ) : null}
    </main>
  );
}

function AnalysisPanel({
  puzzle,
  copy,
  onClose,
}: {
  puzzle: PuzzleRecord;
  copy: Record<string, string>;
  onClose: () => void;
}) {
  const initialNodes = useMemo(
    () => analysisNodesFromPgn(puzzle.gamePgn, puzzle.fenBefore),
    [puzzle.fenBefore, puzzle.gamePgn]
  );
  const initialIndex = Math.min(
    Math.max(puzzle.ply - 1, 0),
    Math.max(0, initialNodes.length - 1)
  );
  const [nodes, setNodes] = useState<AnalysisNode[]>(initialNodes);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const [scoreCp, setScoreCp] = useState(0);
  const [searchDepth, setSearchDepth] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const engineRef = useRef<BrowserStockfish | null>(null);
  const fen = nodes[currentIndex]?.fen ?? puzzle.fenBefore;

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);
  const previousMoveHighlight = nodes[currentIndex]?.from
    ? {
        from: nodes[currentIndex].from,
        to: nodes[currentIndex].to,
      }
    : null;

  const legalTargets = useMemo(() => {
    if (!selectedSquare) {
      return new Set<string>();
    }

    try {
      return new Set(
        chess
          .moves({ square: asSquare(selectedSquare), verbose: true })
          .map((move) => move.to)
      );
    } catch {
      return new Set<string>();
    }
  }, [chess, selectedSquare]);

  const moveRows = useMemo(() => {
    const rows: {
      moveNumber: number;
      white?: AnalysisNode;
      black?: AnalysisNode;
    }[] = [];

    for (const node of nodes.slice(1)) {
      let row = rows.find((item) => item.moveNumber === node.moveNumber);
      if (!row) {
        row = { moveNumber: node.moveNumber };
        rows.push(row);
      }

      if (node.color === "w") {
        row.white = node;
      } else {
        row.black = node;
      }
    }

    return rows;
  }, [nodes]);

  const maxIndex = nodes.length - 1;

  useEffect(() => {
    let cancelled = false;

    async function analyze() {
      setIsAnalyzing(true);
      setSearchDepth(0);
      setEngineLines([]);
      setScoreCp(0);
      try {
        engineRef.current ??= new BrowserStockfish();
        for (const depth of [6, 8, 10, 12, 14]) {
          const result = await engineRef.current.analyzeFenLines(fen, depth, 3);
          if (cancelled) {
            return;
          }
          setSearchDepth(depth);
          setEngineLines(
            result.lines.map((line) => ({
              ...line,
              depth: line.depth ?? depth,
            }))
          );
          setScoreCp(result.scoreCp);
        }
      } catch {
        if (!cancelled) {
          setEngineLines([]);
          setSearchDepth(0);
        }
      } finally {
        if (!cancelled) {
          setIsAnalyzing(false);
        }
      }
    }

    void analyze();

    return () => {
      cancelled = true;
    };
  }, [fen]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
    },
    []
  );

  function selectOrMove(square: string) {
    const piece = chess.get(asSquare(square));
    if (!selectedSquare) {
      if (piece?.color === chess.turn()) {
        setSelectedSquare(square);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (piece?.color === chess.turn()) {
      setSelectedSquare(square);
      return;
    }

    makeMove(selectedSquare, square);
  }

  function makeMove(from: string, to: string) {
    try {
      const next = new Chess(fen);
      const move = next.move({ from, to, promotion: "q" });
      const nextNode: AnalysisNode = {
        fen: next.fen(),
        san: move.san,
        from: move.from,
        to: move.to,
        ply: currentIndex + 1,
        moveNumber: Math.floor(currentIndex / 2) + 1,
        color: move.color,
        isMainLine: false,
      };
      const nextNodes = [...nodes.slice(0, currentIndex + 1), nextNode];
      setNodes(nextNodes);
      setCurrentIndex(nextNodes.length - 1);
      setSelectedSquare(null);
    } catch {
      setSelectedSquare(null);
    }
  }

  const goToIndex = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(maxIndex, index));
    setCurrentIndex(nextIndex);
    setSelectedSquare(null);
  }, [maxIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToIndex(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToIndex(currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        goToIndex(0);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        goToIndex(maxIndex);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, goToIndex, maxIndex]);

  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true">
      <section className="analysis-sheet">
        <div className="analysis-head">
          <div>
            <p className="eyebrow">{copy.engineAnalysis}</p>
            <h2>{puzzle.gameTitle}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            <X size={16} aria-hidden="true" />
            {copy.closeAnalysis}
          </button>
        </div>

        <div className="analysis-layout">
          <div className="analysis-board-zone">
            <div className="eval-with-board">
              <div className="eval-bar" aria-label="evaluation bar">
                <div style={{ height: `${evalPercent(scoreCp)}%` }} />
                <span>{signedScoreLabel(scoreCp)}</span>
              </div>
              <ChessBoard
                fen={fen}
                orientation={puzzle.side}
                activeSide={chess.turn()}
                selectedSquare={selectedSquare}
                legalTargets={legalTargets}
                answerHighlight={null}
                mistakeHighlight={null}
                previousMoveHighlight={previousMoveHighlight}
                onSquareClick={selectOrMove}
                onMove={makeMove}
              />
            </div>
            <p className="analysis-caption">{copy.freeBoard}</p>
          </div>

          <aside className="analysis-side">
            <div className="analysis-box">
              <div className="result-head">
                <strong>{copy.engineLines}</strong>
                {isAnalyzing ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
                {searchDepth ? <span>d{searchDepth}</span> : null}
              </div>
              <div className="engine-lines">
                {engineLines.length ? (
                  engineLines.map((line) => (
                    <div key={`${line.multipv}-${line.bestMove}`}>
                      <span>#{line.multipv}</span>
                      <strong>{uciToSan(fen, line.bestMove)}</strong>
                      <small>{signedScoreLabel(line.scoreCp)} · d{line.depth ?? searchDepth}</small>
                    </div>
                  ))
                ) : (
                  <p>{copy.loadingEngine}</p>
                )}
              </div>
            </div>

            <div className="analysis-box">
              <div className="result-head">
                <strong>{copy.gameRecord}</strong>
                <span>{currentIndex}/{maxIndex}</span>
              </div>
              <div className="move-nav-buttons" aria-label="move navigation">
                <button type="button" onClick={() => goToIndex(0)}>{"<<"}</button>
                <button type="button" onClick={() => goToIndex(currentIndex - 1)}>{"<"}</button>
                <button type="button" onClick={() => goToIndex(currentIndex + 1)}>{">"}</button>
                <button type="button" onClick={() => goToIndex(maxIndex)}>{">>"}</button>
              </div>
              <div className="move-table">
                {moveRows.length ? (
                  moveRows.map((row) => (
                    <div className="move-row" key={row.moveNumber}>
                      <span className="move-number">{row.moveNumber}.</span>
                      <button
                        type="button"
                        className={[
                          row.white && nodes.indexOf(row.white) === currentIndex ? "current" : "",
                          row.white?.ply === puzzle.ply && row.white.isMainLine ? "mistake-ply" : "",
                          row.white && !row.white.isMainLine ? "branch-ply" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => row.white && goToIndex(nodes.indexOf(row.white))}
                      >
                        {row.white?.san ?? ""}
                      </button>
                      <button
                        type="button"
                        className={[
                          row.black && nodes.indexOf(row.black) === currentIndex ? "current" : "",
                          row.black?.ply === puzzle.ply && row.black.isMainLine ? "mistake-ply" : "",
                          row.black && !row.black.isMainLine ? "branch-ply" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => row.black && goToIndex(nodes.indexOf(row.black))}
                        disabled={!row.black}
                      >
                        {row.black?.san ?? ""}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="move-record">{puzzle.gamePgn || puzzle.gameTitle}</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
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

function ChessBoard({
  fen,
  orientation,
  activeSide,
  selectedSquare,
  legalTargets,
  answerHighlight,
  mistakeHighlight,
  previousMoveHighlight,
  onSquareClick,
  onMove,
}: {
  fen: string;
  orientation: "w" | "b";
  activeSide: "w" | "b";
  selectedSquare: string | null;
  legalTargets: Set<string>;
  answerHighlight: { from: string; to: string } | null;
  mistakeHighlight: { from: string; to: string } | null;
  previousMoveHighlight: { from: string; to: string } | null;
  onSquareClick: (square: string) => void;
  onMove: (from: string, to: string) => void;
}) {
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const board = useMemo(() => {
    if (!fen) {
      return null;
    }

    try {
      return new Chess(fen).board();
    } catch {
      return null;
    }
  }, [fen]);

  const rankIndexes =
    orientation === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const fileIndexes =
    orientation === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className="board-wrap">
      <div
        className="board"
        aria-label="棋盘"
        onPointerUp={(event) => {
          if (!dragFrom) {
            return;
          }

          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-square]");
          const to = target?.dataset.square;
          setDragFrom(null);

          if (to && to !== dragFrom) {
            suppressClickRef.current = true;
            onMove(dragFrom, to);
          }
        }}
      >
        {board ? (
          rankIndexes.flatMap((rankIndex) =>
            fileIndexes.map((fileIndex) => {
              const square = `${FILES[fileIndex]}${RANKS[rankIndex]}`;
              const piece = board[rankIndex][fileIndex];
              const isDark = (rankIndex + fileIndex) % 2 === 1;
              const pieceKey = piece ? `${piece.color}${piece.type}` : "";
              const isSelected = selectedSquare === square;
              const isAnswer =
                answerHighlight?.from === square || answerHighlight?.to === square;
              const isMistake =
                mistakeHighlight?.from === square || mistakeHighlight?.to === square;
              const isPreviousMove =
                previousMoveHighlight?.from === square ||
                previousMoveHighlight?.to === square;
              const isPreviousFrom = previousMoveHighlight?.from === square;
              const isLegalTarget = legalTargets.has(square);
              const isDraggable = piece?.color === activeSide;

              return (
                <button
                  type="button"
                  className={[
                    "square",
                    isDark ? "dark" : "light",
                    isSelected ? "selected" : "",
                    isAnswer ? "answer" : "",
                    isMistake ? "mistake" : "",
                    isPreviousMove ? "previous-move" : "",
                    isPreviousFrom ? "previous-from" : "",
                    isLegalTarget ? "legal-target" : "",
                    dragFrom === square ? "dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }

                    onSquareClick(square);
                  }}
                  data-square={square}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from =
                      event.dataTransfer.getData("text/plain") || dragFrom;
                    setDragFrom(null);
                    if (from && from !== square) {
                      onMove(from, square);
                    }
                  }}
                  key={square}
                  aria-label={square}
                >
                  {isLegalTarget && !piece ? <i aria-hidden="true" /> : null}
                  {isLegalTarget && piece ? <b aria-hidden="true" /> : null}
                  <span
                    className={piece ? `piece piece-${piece.color}` : ""}
                    draggable={isDraggable}
                    onPointerDown={() => {
                      if (isDraggable) {
                        setDragFrom(square);
                      }
                    }}
                    onDragStart={(event) => {
                      if (!isDraggable) {
                        event.preventDefault();
                        return;
                      }

                      event.dataTransfer.setData("text/plain", square);
                      event.dataTransfer.effectAllowed = "move";
                      setDragFrom(square);
                    }}
                    onDragEnd={() => setDragFrom(null)}
                  >
                    {piece ? PIECES[pieceKey] : ""}
                  </span>
                </button>
              );
            })
          )
        ) : (
          <div className="board-empty">
            <Play size={34} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="file-strip" aria-hidden="true">
        {(orientation === "w" ? FILES : [...FILES].reverse()).map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  );
}
