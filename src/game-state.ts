import { scoreWord as scoreForWord } from "./rules";
import type { Coordinate } from "./types";

export type CellInput = Coordinate | readonly [number, number] | string;
export type RoundStatus = "active" | "expired";

export interface RoundSnapshot {
  readonly boardId: string;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly remainingMs: number;
  readonly expired: boolean;
  readonly status: RoundStatus;
  readonly score: number;
  readonly highScore: number;
  readonly foundWords: readonly string[];
  readonly usedCells: readonly string[];
}

export interface ValidationDetails {
  readonly valid: boolean;
  readonly reason?: string | null;
}

export type ValidationResult = boolean | ValidationDetails;
export type ValidateWord = (
  word: string,
  cells: readonly unknown[],
  snapshot: RoundSnapshot,
) => ValidationResult;
export type ScoreWord = (
  word: string,
  cells: readonly unknown[],
  snapshot: RoundSnapshot,
) => number;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GameStateOptions {
  readonly boardId: string;
  readonly durationMs?: number;
  readonly storage?: StorageAdapter | null;
  readonly now?: () => number;
  readonly validateWord?: ValidateWord | null;
  readonly scoreWord?: ScoreWord;
}

export interface ResetRoundOptions {
  readonly boardId?: string;
  readonly durationMs?: number;
}

export interface SubmitWordOptions {
  readonly word?: unknown;
  readonly cells?: readonly unknown[];
  readonly valid?: unknown;
  readonly points?: unknown;
}

export interface SubmissionResult {
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly word: string;
  readonly points: number;
  readonly state: RoundSnapshot;
}

export const DEFAULT_ROUND_DURATION_MS = 60_000;
export const HIGH_SCORE_STORAGE_PREFIX = "zoggle.highScore.";
export { scoreForWord };

export function highScoreStorageKey(boardId: unknown): string {
  return `${HIGH_SCORE_STORAGE_PREFIX}${encodeURIComponent(normalizeBoardId(boardId))}`;
}

/**
 * A round state machine with no DOM dependencies.
 *
 * validateWord, when supplied, is called as (word, cells, snapshot).
 * scoreWord is called with the same arguments. A submission can instead pass
 * `valid` and/or `points` directly, which take precedence over those hooks.
 */
export class GameState {
  private readonly now: () => number;
  private readonly validateWord: ValidateWord | null;
  private readonly scoreWord: ScoreWord;
  private readonly storage: StorageAdapter | null;
  private readonly knownHighScores = new Map<string, number>();
  private boardId = "";
  private durationMs = DEFAULT_ROUND_DURATION_MS;
  private startedAt = 0;
  private endsAt = 0;
  private pausedRemainingMs: number | null = null;
  private score = 0;
  private highScore = 0;
  private foundWords: string[] = [];
  private foundWordSet = new Set<string>();
  private usedCells = new Set<string>();

  constructor({
    boardId,
    durationMs = DEFAULT_ROUND_DURATION_MS,
    storage = getDefaultStorage(),
    now = Date.now,
    validateWord = null,
    scoreWord = scoreForWord,
  }: GameStateOptions) {
    this.now = requireFunction(now, "now");
    this.validateWord = optionalFunction(validateWord, "validateWord");
    this.scoreWord = requireFunction(scoreWord, "scoreWord");
    this.storage = storage;

    this.resetRound({ boardId, durationMs });
  }

  /** Start a fresh round. Omit boardId to replay the current board. */
  resetRound({
    boardId = this.boardId,
    durationMs = this.durationMs,
  }: ResetRoundOptions = {}): RoundSnapshot {
    this.boardId = normalizeBoardId(boardId);
    this.durationMs = normalizeDuration(durationMs);
    this.startedAt = readClock(this.now);
    this.endsAt = this.startedAt + this.durationMs;
    this.pausedRemainingMs = null;
    this.score = 0;
    this.foundWords = [];
    this.foundWordSet = new Set();
    this.usedCells = new Set();
    this.highScore = this.readHighScore(this.boardId);

    return this.snapshotAt(this.startedAt);
  }

  /** Alias useful to callers that think of each reset as starting a round. */
  startRound(options?: ResetRoundOptions): RoundSnapshot {
    return this.resetRound(options);
  }

  /**
   * Try to add a word to the current round.
   *
   * cells can contain "row,col" strings, [row, col] tuples, or
   * { row, col } objects. Accepted cells are accumulated for board highlighting.
   */
  submitWord({
    word,
    cells = [],
    valid,
    points,
  }: SubmitWordOptions = {}): SubmissionResult {
    const submittedAt = readClock(this.now);
    const normalizedWord = normalizeWord(word);

    if (this.isExpiredAt(submittedAt)) {
      return this.rejection("expired", normalizedWord, submittedAt);
    }

    if (!normalizedWord) {
      return this.rejection("invalid-word", normalizedWord, submittedAt);
    }

    if (this.foundWordSet.has(normalizedWord)) {
      return this.rejection("duplicate", normalizedWord, submittedAt);
    }

    const normalizedCells = normalizeCells(cells);
    if (!normalizedCells) {
      return this.rejection("invalid-cells", normalizedWord, submittedAt);
    }

    if (normalizedCells.some((cell) => this.usedCells.has(cell))) {
      return this.rejection("used-cell", normalizedWord, submittedAt);
    }

    const beforeSubmission = this.snapshotAt(submittedAt);
    const validation = valid === undefined
      ? this.runValidation(normalizedWord, cells, beforeSubmission)
      : valid;
    const validationResult = normalizeValidationResult(validation);

    if (!validationResult.valid) {
      return this.rejection(
        validationResult.reason || "invalid-word",
        normalizedWord,
        submittedAt,
      );
    }

    const awardedPoints = points === undefined
      ? this.scoreWord(normalizedWord, cells, beforeSubmission)
      : points;

    if (
      typeof awardedPoints !== "number" ||
      !Number.isFinite(awardedPoints) ||
      awardedPoints < 0
    ) {
      return this.rejection("invalid-score", normalizedWord, submittedAt);
    }

    this.foundWords.push(normalizedWord);
    this.foundWordSet.add(normalizedWord);
    for (const cell of normalizedCells) this.usedCells.add(cell);
    this.score += awardedPoints;

    const latestHighScore = this.readHighScore(this.boardId);

    if (this.score > latestHighScore) {
      this.highScore = this.score;
      this.knownHighScores.set(this.boardId, this.highScore);
      this.writeHighScore(this.boardId, this.highScore);
    } else {
      this.highScore = latestHighScore;
    }

    return {
      accepted: true,
      reason: null,
      word: normalizedWord,
      points: awardedPoints,
      state: this.snapshotAt(submittedAt),
    };
  }

  getSnapshot(): RoundSnapshot {
    return this.snapshotAt(readClock(this.now));
  }

  /** Freeze the round clock until resume is called. */
  pause(): RoundSnapshot {
    const pausedAt = readClock(this.now);
    if (this.pausedRemainingMs === null) {
      const remainingMs = this.remainingMsAt(pausedAt);
      if (remainingMs > 0) this.pausedRemainingMs = remainingMs;
    }
    return this.snapshotAt(pausedAt);
  }

  /** Continue a paused round without counting time spent paused. */
  resume(): RoundSnapshot {
    const resumedAt = readClock(this.now);
    if (this.pausedRemainingMs !== null) {
      this.endsAt = resumedAt + this.pausedRemainingMs;
      this.pausedRemainingMs = null;
    }
    return this.snapshotAt(resumedAt);
  }

  isPaused(): boolean {
    return this.pausedRemainingMs !== null;
  }

  getRemainingMs(): number {
    return this.getSnapshot().remainingMs;
  }

  isExpired(): boolean {
    return this.isExpiredAt(readClock(this.now));
  }

  isCellUsed(cell: unknown): boolean {
    const normalized = normalizeCell(cell);
    return normalized !== null && this.usedCells.has(normalized);
  }

  private runValidation(
    word: string,
    cells: readonly unknown[],
    snapshot: RoundSnapshot,
  ): ValidationResult {
    if (!this.validateWord) return false;
    return this.validateWord(word, cells, snapshot);
  }

  private rejection(reason: string, word: string, at: number): SubmissionResult {
    return {
      accepted: false,
      reason,
      word,
      points: 0,
      state: this.snapshotAt(at),
    };
  }

  private snapshotAt(at: number): RoundSnapshot {
    const remainingMs = this.remainingMsAt(at);
    const expired = remainingMs === 0;

    return Object.freeze({
      boardId: this.boardId,
      durationMs: this.durationMs,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      remainingMs,
      expired,
      status: expired ? "expired" : "active",
      score: this.score,
      highScore: this.highScore,
      foundWords: Object.freeze([...this.foundWords]),
      usedCells: Object.freeze([...this.usedCells]),
    });
  }

  private isExpiredAt(at: number): boolean {
    return this.remainingMsAt(at) === 0;
  }

  private remainingMsAt(at: number): number {
    if (this.pausedRemainingMs !== null) return this.pausedRemainingMs;
    return Math.min(this.durationMs, Math.max(0, this.endsAt - at));
  }

  private readHighScore(boardId: string): number {
    const knownScore = this.knownHighScores.get(boardId) ?? 0;
    let storedScore = 0;

    try {
      const stored = this.storage?.getItem(highScoreStorageKey(boardId));
      if (stored !== null && stored !== undefined && stored !== "") {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed >= 0) storedScore = parsed;
      }
    } catch {
      // Storage can be unavailable in private browsing or blocked contexts.
    }

    const highScore = Math.max(knownScore, storedScore);
    this.knownHighScores.set(boardId, highScore);
    return highScore;
  }

  private writeHighScore(boardId: string, highScore: number): void {
    try {
      this.storage?.setItem(highScoreStorageKey(boardId), String(highScore));
    } catch {
      // The in-memory high score remains authoritative for this session.
    }
  }
}

export function createGameState(options: GameStateOptions): GameState {
  return new GameState(options);
}

function normalizeWord(word: unknown): string {
  return typeof word === "string" ? word.trim().toLowerCase() : "";
}

function normalizeCells(cells: unknown): string[] | null {
  if (!Array.isArray(cells)) return null;

  const normalized = [];
  for (const cell of cells) {
    const key = normalizeCell(cell);
    if (key === null) return null;
    normalized.push(key);
  }
  return normalized;
}

function normalizeCell(cell: unknown): string | null {
  if (typeof cell === "string") {
    const match = /^(\d+),(\d+)$/.exec(cell.trim());
    if (!match) return null;

    const row = Number(match[1]);
    const col = Number(match[2]);
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col)) return null;
    return `${row},${col}`;
  }

  const tuple: readonly unknown[] | null = Array.isArray(cell) ? cell : null;
  const object = cell as { readonly row?: unknown; readonly col?: unknown } | null;
  const row = tuple ? tuple[0] : object?.row;
  const col = tuple ? tuple[1] : object?.col;
  if (
    typeof row !== "number" ||
    !Number.isInteger(row) ||
    row < 0 ||
    typeof col !== "number" ||
    !Number.isInteger(col) ||
    col < 0
  ) {
    return null;
  }
  return `${row},${col}`;
}

function normalizeValidationResult(result: unknown): {
  readonly valid: boolean;
  readonly reason: string | null;
} {
  if (typeof result === "object" && result !== null) {
    return {
      valid: (result as ValidationDetails).valid === true,
      reason:
        typeof (result as ValidationDetails).reason === "string"
          ? (result as ValidationDetails).reason ?? null
          : null,
    };
  }
  return { valid: result === true, reason: null };
}

function normalizeBoardId(boardId: unknown): string {
  if (typeof boardId !== "string" || boardId.trim() === "") {
    throw new TypeError("boardId must be a non-empty string");
  }
  return boardId.trim();
}

function normalizeDuration(durationMs: unknown): number {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    throw new RangeError("durationMs must be a positive finite number");
  }
  return durationMs;
}

type Callable = (...args: never[]) => unknown;

function requireFunction<T extends Callable>(value: T, name: string): T {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}

function optionalFunction<T extends Callable>(
  value: T | null | undefined,
  name: string,
): T | null {
  if (value === null || value === undefined) return null;
  return requireFunction(value, name);
}

function readClock(now: () => number): number {
  const value = now();
  if (!Number.isFinite(value)) throw new TypeError("now must return a finite number");
  return value;
}

function getDefaultStorage(): StorageAdapter | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
