import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BOARDS,
  ENDLESS_MAX_TIME_SECONDS,
  ROUND_SECONDS,
} from "../config";
import {
  buildWordTrie,
  type WordTrie,
} from "../board-generation";
import {
  findBestCascadeCandidate,
  MAX_CASCADE_DEPTH,
  type CascadeCandidate,
} from "../endless-cascade";
import {
  applyBoardGravity,
  type GravityTileFall,
  type RandomSource,
} from "../endless-board";
import {
  GameState,
  type RoundSnapshot,
  type SubmissionResult,
  type ValidateWord,
} from "../game-state";
import { isEligibleWord, scoreWord, wordFromPath } from "../rules";
import type {
  BoardDefinition,
  Coordinate,
  GameMode,
  TimeBonus,
} from "../types";

export type StatusTone = "neutral" | "success" | "error";

export interface StatusMessage {
  readonly text: string;
  readonly tone: StatusTone;
}

interface GameSession {
  readonly game: GameState;
  readonly board: BoardDefinition;
  readonly boardIndex: number;
  readonly cascadeKey: number;
  readonly cascadePhase: CascadePhase | null;
  readonly feedbackKey: number;
  readonly feedbackWord: string;
  readonly paused: boolean;
  readonly snapshot: RoundSnapshot;
  readonly sourceBoard: BoardDefinition;
  readonly roundKey: number;
  readonly status: StatusMessage;
  readonly timeBonusKey: number;
  readonly timeBonusSeconds: number;
}

interface FallingPhase {
  readonly beforeBoard: BoardDefinition;
  /** Number of automatic words already awarded in this chain. */
  readonly depth: number;
  readonly falls: readonly GravityTileFall[];
  readonly frontier: readonly Coordinate[];
  readonly key: number;
  readonly kind: "falling";
}

interface MatchingPhase {
  readonly candidate: CascadeCandidate;
  /** One-based number of the highlighted automatic word. */
  readonly depth: number;
  readonly key: number;
  readonly kind: "matching";
}

type CascadePhase = FallingPhase | MatchingPhase;

export interface GameController {
  readonly board: BoardDefinition;
  readonly cascadeCells: ReadonlySet<string>;
  readonly currentWord: string;
  readonly enabled: boolean;
  readonly gravityFalls: readonly GravityTileFall[];
  readonly gravityKey: number;
  readonly isSelectionEnabled: () => boolean;
  readonly path: readonly Coordinate[];
  readonly resolving: boolean;
  readonly roundKey: number;
  readonly snapshot: RoundSnapshot;
  readonly status: StatusMessage;
  readonly timeBonus: TimeBonus | null;
  readonly usedCells: ReadonlySet<string>;
  readonly onPathChange: (path: readonly Coordinate[]) => void;
  readonly onSubmit: (path: readonly Coordinate[]) => void;
  readonly playAgain: () => void;
  readonly playBoard: (board: BoardDefinition) => void;
  readonly playNextBoard: () => void;
}

const READY_STATUS: StatusMessage = {
  text: "Hold and drag across neighboring letters to make a word.",
  tone: "neutral",
};

const EMPTY_STATUS: StatusMessage = {
  text: "",
  tone: "neutral",
};

const FEEDBACK_DURATION_MS = 3_000;
const TIME_BONUS_DURATION_MS = 900;
export const GRAVITY_ANIMATION_MS = 560;
export const CASCADE_HIGHLIGHT_MS = 1_000;
const cascadeTries = new WeakMap<ReadonlySet<string>, WordTrie>();

function boardAt(
  boards: readonly BoardDefinition[],
  index: number,
): BoardDefinition {
  const board = boards[index];
  if (!board) throw new RangeError(`Missing board at index ${index}`);
  return board;
}

function scoreBoardId(mode: GameMode, boardId: string): string {
  return mode === "classic" ? boardId : `endless:${boardId}`;
}

function cellKey({ row, col }: Coordinate): string {
  return `${row},${col}`;
}

function pageHasFocus(): boolean {
  if (typeof document === "undefined") return true;
  return !document.hidden &&
    (typeof document.hasFocus !== "function" || document.hasFocus());
}

function validatorFor(dictionary: ReadonlySet<string>): ValidateWord {
  return (word, _cells, snapshot) => {
    if (isEligibleWord(word, dictionary, snapshot.foundWords)) {
      return true;
    }
    if (word.length < 3) return { valid: false, reason: "too-short" };
    if (!/^[a-z]+$/.test(word)) {
      return { valid: false, reason: "unsupported-word" };
    }
    if (!dictionary.has(word)) {
      return { valid: false, reason: "not-in-dictionary" };
    }
    return { valid: false, reason: "duplicate" };
  };
}

function submissionMessage(
  result: SubmissionResult,
  usesGravity = false,
): StatusMessage {
  if (result.accepted) {
    const suffix = result.points === 1 ? "point" : "points";
    return {
      text: `+${result.points} ${suffix}${usesGravity ? " · Gravity!" : ""}`,
      tone: "success",
    };
  }

  const messages: Readonly<Record<string, string>> = {
    duplicate: "You already found that word.",
    expired: "Time’s up — start another round to keep playing.",
    "invalid-cells": "That path cannot be used.",
    "invalid-word": "That is not a playable word.",
    "not-in-dictionary": "That word is not in the dictionary.",
    "too-short": "Words need at least three letters.",
    "unsupported-word": "Only lowercase, unhyphenated dictionary words count.",
    "used-cell": "Each tile can be used only once per round.",
  };

  return {
    text: messages[result.reason ?? ""] ?? "That word cannot be scored.",
    tone: "error",
  };
}

function cascadeMessage(depth: number, points: number): StatusMessage {
  return {
    text: `Cascade ${depth} · +${points} ${points === 1 ? "point" : "points"}`,
    tone: "success",
  };
}

function roundCompleteStatus(score: number): StatusMessage {
  return {
    text: `Round complete — ${score} ${score === 1 ? "point" : "points"}.`,
    tone: "neutral",
  };
}

function phaseDelay(durationMs: number): number {
  if (typeof window.matchMedia !== "function") return durationMs;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : durationMs;
}

function cascadeTrieFor(dictionary: ReadonlySet<string>): WordTrie {
  const existing = cascadeTries.get(dictionary);
  if (existing !== undefined) return existing;

  const trie = buildWordTrie(dictionary);
  cascadeTries.set(dictionary, trie);
  return trie;
}

export function useGame(
  dictionary: ReadonlySet<string>,
  boards: readonly BoardDefinition[] = BOARDS,
  mode: GameMode = "classic",
  endlessTileRandom: RandomSource = Math.random,
): GameController {
  const cascadeTrie = useMemo<WordTrie | null>(
    () => mode === "endless" ? cascadeTrieFor(dictionary) : null,
    [dictionary, mode],
  );
  const [session, setSession] = useState<GameSession>(() => {
    const board = boardAt(boards, 0);
    const game = new GameState({
      boardId: scoreBoardId(mode, board.id),
      consumeCells: mode === "classic",
      durationMs: ROUND_SECONDS * 1000,
      validateWord: validatorFor(dictionary),
      scoreWord,
    });
    const snapshot = pageHasFocus() ? game.getSnapshot() : game.pause();
    return {
      game,
      board,
      boardIndex: 0,
      cascadeKey: 0,
      cascadePhase: null,
      feedbackKey: 0,
      feedbackWord: "",
      paused: game.isPaused(),
      snapshot,
      sourceBoard: board,
      roundKey: 0,
      status: READY_STATUS,
      timeBonusKey: 0,
      timeBonusSeconds: 0,
    };
  });
  const sessionRef = useRef(session);
  const [path, setPath] = useState<readonly Coordinate[]>([]);
  const commitSession = useCallback((nextSession: GameSession) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const { game } = session;
  const { paused } = session;
  const { endsAt, expired } = session.snapshot;

  useEffect(() => {
    if (expired || paused) return;

    const timerId = window.setInterval(() => {
      if (game.isPaused()) return;
      const snapshot = game.getSnapshot();
      const current = sessionRef.current;
      if (current.game !== game) return;

      commitSession({
        ...current,
        feedbackWord: snapshot.expired ? "" : current.feedbackWord,
        snapshot,
        status: snapshot.expired
          ? roundCompleteStatus(snapshot.score)
          : current.status,
      });
    }, 100);

    return () => window.clearInterval(timerId);
  }, [commitSession, endsAt, expired, game, paused]);

  useEffect(() => {
    if (
      session.cascadePhase !== null ||
      !session.feedbackWord ||
      session.status.tone !== "success"
    ) {
      return;
    }

    const feedbackKey = session.feedbackKey;
    const timerId = window.setTimeout(() => {
      const current = sessionRef.current;
      if (
        current.game !== game ||
        current.feedbackKey !== feedbackKey ||
        !current.feedbackWord ||
        current.status.tone !== "success"
      ) {
        return;
      }

      commitSession({
        ...current,
        feedbackWord: "",
        status: EMPTY_STATUS,
      });
    }, FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timerId);
  }, [
    commitSession,
    game,
    session.cascadePhase,
    session.feedbackKey,
    session.feedbackWord,
    session.status.tone,
  ]);

  useEffect(() => {
    if (session.timeBonusSeconds <= 0) return;

    const timeBonusKey = session.timeBonusKey;
    const timerId = window.setTimeout(() => {
      const current = sessionRef.current;
      if (
        current.game !== game ||
        current.timeBonusKey !== timeBonusKey ||
        current.timeBonusSeconds <= 0
      ) {
        return;
      }

      commitSession({
        ...current,
        timeBonusSeconds: 0,
      });
    }, TIME_BONUS_DURATION_MS);

    return () => window.clearTimeout(timerId);
  }, [
    commitSession,
    game,
    session.timeBonusKey,
    session.timeBonusSeconds,
  ]);

  useEffect(() => {
    const pauseRound = () => {
      const current = sessionRef.current;
      if (
        current.game !== game ||
        current.paused ||
        current.snapshot.expired
      ) {
        return;
      }

      const snapshot = game.pause();
      commitSession({
        ...current,
        feedbackWord: snapshot.expired ? "" : current.feedbackWord,
        paused: game.isPaused(),
        snapshot,
        status: snapshot.expired
          ? roundCompleteStatus(snapshot.score)
          : current.status,
      });
    };

    const resumeRound = () => {
      const current = sessionRef.current;
      if (
        current.game !== game ||
        current.cascadePhase !== null ||
        !current.paused ||
        !pageHasFocus()
      ) {
        return;
      }

      commitSession({
        ...current,
        paused: false,
        snapshot: game.resume(),
      });
    };

    const syncPageFocus = () => {
      if (pageHasFocus()) {
        resumeRound();
      } else {
        pauseRound();
      }
    };

    window.addEventListener("blur", pauseRound);
    window.addEventListener("focus", syncPageFocus);
    document.addEventListener("visibilitychange", syncPageFocus);
    syncPageFocus();
    return () => {
      window.removeEventListener("blur", pauseRound);
      window.removeEventListener("focus", syncPageFocus);
      document.removeEventListener("visibilitychange", syncPageFocus);
    };
  }, [commitSession, game]);

  useEffect(() => {
    const phase = session.cascadePhase;
    if (phase === null) return;

    const duration = phase.kind === "falling"
      ? GRAVITY_ANIMATION_MS
      : CASCADE_HIGHLIGHT_MS;
    const timerId = window.setTimeout(() => {
      const current = sessionRef.current;
      const currentPhase = current.cascadePhase;
      if (
        current.game !== game ||
        currentPhase === null ||
        currentPhase.key !== phase.key ||
        currentPhase.kind !== phase.kind
      ) {
        return;
      }

      const finishCascade = () => {
        const snapshot = pageHasFocus()
          ? current.game.resume()
          : current.game.getSnapshot();
        commitSession({
          ...current,
          cascadePhase: null,
          feedbackWord: snapshot.expired ? "" : current.feedbackWord,
          paused: current.game.isPaused(),
          snapshot,
          status: snapshot.expired
            ? roundCompleteStatus(snapshot.score)
            : current.status,
        });
      };

      if (currentPhase.kind === "falling") {
        if (
          cascadeTrie === null ||
          currentPhase.depth >= MAX_CASCADE_DEPTH ||
          current.snapshot.expired
        ) {
          finishCascade();
          return;
        }

        const candidate = findBestCascadeCandidate({
          beforeBoard: currentPhase.beforeBoard.letters,
          afterBoard: current.board.letters,
          excludedWords: current.snapshot.foundWords,
          frontier: currentPhase.frontier,
          trie: cascadeTrie,
        });
        if (candidate === null) {
          finishCascade();
          return;
        }

        const result = current.game.submitWord({
          cells: candidate.path,
          word: candidate.word,
        });
        if (!result.accepted) {
          finishCascade();
          return;
        }

        const depth = currentPhase.depth + 1;
        const cascadeKey = current.cascadeKey + 1;
        commitSession({
          ...current,
          cascadeKey,
          cascadePhase: {
            candidate,
            depth,
            key: cascadeKey,
            kind: "matching",
          },
          feedbackKey: current.feedbackKey + 1,
          feedbackWord: result.word,
          snapshot: result.state,
          status: cascadeMessage(depth, result.points),
        });
        return;
      }

      const gravity = applyBoardGravity(
        current.board,
        currentPhase.candidate.path,
        { random: endlessTileRandom },
      );
      const cascadeKey = current.cascadeKey + 1;
      commitSession({
        ...current,
        board: gravity.board,
        cascadeKey,
        cascadePhase: {
          beforeBoard: current.board,
          depth: currentPhase.depth,
          falls: gravity.falls,
          frontier: gravity.frontier,
          key: cascadeKey,
          kind: "falling",
        },
      });
    }, phaseDelay(duration));

    return () => window.clearTimeout(timerId);
  }, [
    cascadeTrie,
    commitSession,
    endlessTileRandom,
    game,
    session.cascadePhase,
  ]);

  const resetRound = useCallback((advanceBoard: boolean) => {
    const current = sessionRef.current;
    setPath([]);
    const boardIndex = advanceBoard
      ? (current.boardIndex + 1) % boards.length
      : current.boardIndex;
    const board = advanceBoard
      ? boardAt(boards, boardIndex)
      : current.sourceBoard;
    let snapshot = current.game.resetRound({
      boardId: scoreBoardId(mode, board.id),
      durationMs: ROUND_SECONDS * 1000,
    });
    if (!pageHasFocus()) snapshot = current.game.pause();

    commitSession({
      ...current,
      board,
      boardIndex,
      cascadeKey: current.cascadeKey + 1,
      cascadePhase: null,
      feedbackKey: current.feedbackKey + 1,
      feedbackWord: "",
      paused: current.game.isPaused(),
      snapshot,
      sourceBoard: board,
      roundKey: current.roundKey + 1,
      status: READY_STATUS,
      timeBonusKey: current.timeBonusKey + 1,
      timeBonusSeconds: 0,
    });
  }, [boards, commitSession, mode]);

  const board = session.board;
  const pathWord = useMemo(() => {
    if (path.length === 0) return "";
    try {
      return wordFromPath(board.letters, path);
    } catch {
      return "";
    }
  }, [board, path]);

  const onPathChange = useCallback((nextPath: readonly Coordinate[]) => {
    setPath(nextPath);
    if (nextPath.length === 0) return;

    const current = sessionRef.current;
    const hasSuccessFeedback =
      Boolean(current.feedbackWord) && current.status.tone === "success";
    if (!hasSuccessFeedback && current.status !== READY_STATUS) {
      return;
    }

    commitSession({
      ...current,
      feedbackKey: current.feedbackKey + 1,
      feedbackWord: "",
      status: EMPTY_STATUS,
    });
  }, [commitSession]);

  const onSubmit = useCallback((submittedPath: readonly Coordinate[]) => {
    const current = sessionRef.current;
    const currentBoard = current.board;
    let word: string;
    try {
      word = wordFromPath(currentBoard.letters, submittedPath);
    } catch {
      commitSession({
        ...current,
        feedbackKey: current.feedbackKey + 1,
        feedbackWord: "",
        status: { text: "That path cannot be used.", tone: "error" },
      });
      return;
    }

    const result = current.game.submitWord({ word, cells: submittedPath });
    if (result.accepted && mode === "endless") {
      const timeBonus = current.game.addTime(
        result.points * 1000,
        ENDLESS_MAX_TIME_SECONDS * 1000,
        result.submittedAt,
      );
      const snapshot = current.game.pause();
      const gravity = applyBoardGravity(currentBoard, submittedPath, {
        random: endlessTileRandom,
      });
      const cascadeKey = current.cascadeKey + 1;
      commitSession({
        ...current,
        board: gravity.board,
        cascadeKey,
        cascadePhase: {
          beforeBoard: currentBoard,
          depth: 0,
          falls: gravity.falls,
          frontier: gravity.frontier,
          key: cascadeKey,
          kind: "falling",
        },
        feedbackKey: current.feedbackKey + 1,
        feedbackWord: result.word,
        paused: current.game.isPaused(),
        snapshot,
        status: snapshot.expired
          ? roundCompleteStatus(snapshot.score)
          : submissionMessage(result, true),
        timeBonusKey: current.timeBonusKey + 1,
        timeBonusSeconds: timeBonus.addedMs / 1000,
      });
      return;
    }

    commitSession({
      ...current,
      feedbackKey: current.feedbackKey + 1,
      feedbackWord: result.accepted ? result.word : "",
      snapshot: result.state,
      status: result.state.expired
        ? roundCompleteStatus(result.state.score)
        : submissionMessage(result),
    });
  }, [commitSession, endlessTileRandom, mode]);

  const playAgain = useCallback(() => resetRound(false), [resetRound]);
  const playBoard = useCallback((board: BoardDefinition) => {
    const current = sessionRef.current;
    setPath([]);
    let snapshot = current.game.resetRound({
      boardId: scoreBoardId(mode, board.id),
      durationMs: ROUND_SECONDS * 1000,
    });
    if (!pageHasFocus()) snapshot = current.game.pause();

    commitSession({
      ...current,
      board,
      cascadeKey: current.cascadeKey + 1,
      cascadePhase: null,
      feedbackKey: current.feedbackKey + 1,
      feedbackWord: "",
      paused: current.game.isPaused(),
      snapshot,
      sourceBoard: board,
      roundKey: current.roundKey + 1,
      status: READY_STATUS,
      timeBonusKey: current.timeBonusKey + 1,
      timeBonusSeconds: 0,
    });
  }, [commitSession, mode]);
  const playNextBoard = useCallback(() => resetRound(true), [resetRound]);
  const isSelectionEnabled = useCallback(() => {
    const current = sessionRef.current;
    return current.cascadePhase === null &&
      !current.game.isPaused() &&
      !current.game.isExpired();
  }, []);

  const { snapshot } = session;
  const usedCells = new Set(snapshot.usedCells);
  const cascadeCells = new Set(
    session.cascadePhase?.kind === "matching"
      ? session.cascadePhase.candidate.path.map(cellKey)
      : [],
  );
  const gravityFalls = session.cascadePhase?.kind === "falling"
    ? session.cascadePhase.falls
    : [];

  return {
    board,
    cascadeCells,
    currentWord: pathWord || session.feedbackWord,
    enabled: !snapshot.expired && session.cascadePhase === null,
    gravityFalls,
    gravityKey: session.cascadeKey,
    isSelectionEnabled,
    path,
    resolving: session.cascadePhase !== null,
    roundKey: session.roundKey,
    snapshot,
    status: session.status,
    timeBonus: session.timeBonusSeconds > 0
      ? {
          key: session.timeBonusKey,
          seconds: session.timeBonusSeconds,
        }
      : null,
    usedCells,
    onPathChange,
    onSubmit,
    playAgain,
    playBoard,
    playNextBoard,
  };
}
