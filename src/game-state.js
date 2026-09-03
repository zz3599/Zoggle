import { scoreWord as scoreForWord } from "./rules.js";

export const DEFAULT_ROUND_DURATION_MS = 60_000;
export const HIGH_SCORE_STORAGE_PREFIX = "zoggle.highScore.";
export { scoreForWord };

export function highScoreStorageKey(boardId) {
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
  constructor({
    boardId,
    durationMs = DEFAULT_ROUND_DURATION_MS,
    storage = getDefaultStorage(),
    now = Date.now,
    validateWord = null,
    scoreWord = scoreForWord,
  } = {}) {
    this._now = requireFunction(now, "now");
    this._validateWord = optionalFunction(validateWord, "validateWord");
    this._scoreWord = requireFunction(scoreWord, "scoreWord");
    this._storage = storage;
    this._knownHighScores = new Map();

    this.resetRound({ boardId, durationMs });
  }

  /** Start a fresh round. Omit boardId to replay the current board. */
  resetRound({ boardId = this._boardId, durationMs = this._durationMs } = {}) {
    this._boardId = normalizeBoardId(boardId);
    this._durationMs = normalizeDuration(durationMs);
    this._startedAt = readClock(this._now);
    this._endsAt = this._startedAt + this._durationMs;
    this._score = 0;
    this._foundWords = [];
    this._foundWordSet = new Set();
    this._usedCells = new Set();
    this._highScore = this._readHighScore(this._boardId);

    return this._snapshotAt(this._startedAt);
  }

  /** Alias useful to callers that think of each reset as starting a round. */
  startRound(options) {
    return this.resetRound(options);
  }

  /**
   * Try to add a word to the current round.
   *
   * cells can contain "row,col" strings, [row, col] tuples, or
   * { row, col } objects. Accepted cells are accumulated for board highlighting.
   */
  submitWord({ word, cells = [], valid, points } = {}) {
    const submittedAt = readClock(this._now);
    const normalizedWord = normalizeWord(word);

    if (this._isExpiredAt(submittedAt)) {
      return this._rejection("expired", normalizedWord, submittedAt);
    }

    if (!normalizedWord) {
      return this._rejection("invalid-word", normalizedWord, submittedAt);
    }

    if (this._foundWordSet.has(normalizedWord)) {
      return this._rejection("duplicate", normalizedWord, submittedAt);
    }

    const normalizedCells = normalizeCells(cells);
    if (!normalizedCells) {
      return this._rejection("invalid-cells", normalizedWord, submittedAt);
    }

    if (normalizedCells.some((cell) => this._usedCells.has(cell))) {
      return this._rejection("used-cell", normalizedWord, submittedAt);
    }

    const beforeSubmission = this._snapshotAt(submittedAt);
    const validation = valid === undefined
      ? this._runValidation(normalizedWord, cells, beforeSubmission)
      : valid;
    const validationResult = normalizeValidationResult(validation);

    if (!validationResult.valid) {
      return this._rejection(
        validationResult.reason || "invalid-word",
        normalizedWord,
        submittedAt,
      );
    }

    const awardedPoints = points === undefined
      ? this._scoreWord(normalizedWord, cells, beforeSubmission)
      : points;

    if (!Number.isFinite(awardedPoints) || awardedPoints < 0) {
      return this._rejection("invalid-score", normalizedWord, submittedAt);
    }

    this._foundWords.push(normalizedWord);
    this._foundWordSet.add(normalizedWord);
    for (const cell of normalizedCells) this._usedCells.add(cell);
    this._score += awardedPoints;

    const latestHighScore = this._readHighScore(this._boardId);

    if (this._score > latestHighScore) {
      this._highScore = this._score;
      this._knownHighScores.set(this._boardId, this._highScore);
      this._writeHighScore(this._boardId, this._highScore);
    } else {
      this._highScore = latestHighScore;
    }

    return {
      accepted: true,
      reason: null,
      word: normalizedWord,
      points: awardedPoints,
      state: this._snapshotAt(submittedAt),
    };
  }

  getSnapshot() {
    return this._snapshotAt(readClock(this._now));
  }

  getRemainingMs() {
    return this.getSnapshot().remainingMs;
  }

  isExpired() {
    return this._isExpiredAt(readClock(this._now));
  }

  isCellUsed(cell) {
    const normalized = normalizeCell(cell);
    return normalized !== null && this._usedCells.has(normalized);
  }

  _runValidation(word, cells, snapshot) {
    if (!this._validateWord) return false;
    return this._validateWord(word, cells, snapshot);
  }

  _rejection(reason, word, at) {
    return {
      accepted: false,
      reason,
      word,
      points: 0,
      state: this._snapshotAt(at),
    };
  }

  _snapshotAt(at) {
    const remainingMs = Math.min(
      this._durationMs,
      Math.max(0, this._endsAt - at),
    );
    const expired = remainingMs === 0;

    return Object.freeze({
      boardId: this._boardId,
      durationMs: this._durationMs,
      startedAt: this._startedAt,
      endsAt: this._endsAt,
      remainingMs,
      expired,
      status: expired ? "expired" : "active",
      score: this._score,
      highScore: this._highScore,
      foundWords: Object.freeze([...this._foundWords]),
      usedCells: Object.freeze([...this._usedCells]),
    });
  }

  _isExpiredAt(at) {
    return at >= this._endsAt;
  }

  _readHighScore(boardId) {
    const knownScore = this._knownHighScores.get(boardId) ?? 0;
    let storedScore = 0;

    try {
      const stored = this._storage?.getItem?.(highScoreStorageKey(boardId));
      if (stored !== null && stored !== undefined && stored !== "") {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed >= 0) storedScore = parsed;
      }
    } catch {
      // Storage can be unavailable in private browsing or blocked contexts.
    }

    const highScore = Math.max(knownScore, storedScore);
    this._knownHighScores.set(boardId, highScore);
    return highScore;
  }

  _writeHighScore(boardId, highScore) {
    try {
      this._storage?.setItem?.(highScoreStorageKey(boardId), String(highScore));
    } catch {
      // The in-memory high score remains authoritative for this session.
    }
  }
}

export function createGameState(options) {
  return new GameState(options);
}

function normalizeWord(word) {
  return typeof word === "string" ? word.trim().toLowerCase() : "";
}

function normalizeCells(cells) {
  if (!Array.isArray(cells)) return null;

  const normalized = [];
  for (const cell of cells) {
    const key = normalizeCell(cell);
    if (key === null) return null;
    normalized.push(key);
  }
  return normalized;
}

function normalizeCell(cell) {
  if (typeof cell === "string") {
    const match = /^(\d+),(\d+)$/.exec(cell.trim());
    if (!match) return null;

    const row = Number(match[1]);
    const col = Number(match[2]);
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col)) return null;
    return `${row},${col}`;
  }

  const row = Array.isArray(cell) ? cell[0] : cell?.row;
  const col = Array.isArray(cell) ? cell[1] : cell?.col;
  if (!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0) {
    return null;
  }
  return `${row},${col}`;
}

function normalizeValidationResult(result) {
  if (typeof result === "object" && result !== null) {
    return {
      valid: result.valid === true,
      reason: typeof result.reason === "string" ? result.reason : null,
    };
  }
  return { valid: result === true, reason: null };
}

function normalizeBoardId(boardId) {
  if (typeof boardId !== "string" || boardId.trim() === "") {
    throw new TypeError("boardId must be a non-empty string");
  }
  return boardId.trim();
}

function normalizeDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError("durationMs must be a positive finite number");
  }
  return durationMs;
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}

function optionalFunction(value, name) {
  if (value === null || value === undefined) return null;
  return requireFunction(value, name);
}

function readClock(now) {
  const value = now();
  if (!Number.isFinite(value)) throw new TypeError("now must return a finite number");
  return value;
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
