import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BOARDS, ROUND_SECONDS } from "../config";
import {
  GameState,
  type RoundSnapshot,
  type SubmissionResult,
  type ValidateWord,
} from "../game-state";
import { isEligibleWord, scoreWord, wordFromPath } from "../rules";
import type { BoardDefinition, Coordinate } from "../types";

export type StatusTone = "neutral" | "success" | "error";

export interface StatusMessage {
  readonly text: string;
  readonly tone: StatusTone;
}

interface GameSession {
  readonly game: GameState;
  readonly boardIndex: number;
  readonly paused: boolean;
  readonly snapshot: RoundSnapshot;
  readonly roundKey: number;
  readonly status: StatusMessage;
}

export interface GameController {
  readonly board: BoardDefinition;
  readonly currentWord: string;
  readonly enabled: boolean;
  readonly isSelectionEnabled: () => boolean;
  readonly path: readonly Coordinate[];
  readonly roundKey: number;
  readonly snapshot: RoundSnapshot;
  readonly status: StatusMessage;
  readonly usedCells: ReadonlySet<string>;
  readonly onPathChange: (path: readonly Coordinate[]) => void;
  readonly onSubmit: (path: readonly Coordinate[]) => void;
  readonly playAgain: () => void;
  readonly playNextBoard: () => void;
}

const READY_STATUS: StatusMessage = {
  text: "Hold and drag across neighboring letters to make a word.",
  tone: "neutral",
};

function boardAt(index: number): BoardDefinition {
  const board = BOARDS[index];
  if (!board) throw new RangeError(`Missing board at index ${index}`);
  return board;
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

function submissionMessage(result: SubmissionResult): StatusMessage {
  if (result.accepted) {
    const suffix = result.points === 1 ? "point" : "points";
    return {
      text: `${result.word.toUpperCase()} · +${result.points} ${suffix}`,
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

function roundCompleteStatus(score: number): StatusMessage {
  return {
    text: `Round complete — ${score} ${score === 1 ? "point" : "points"}.`,
    tone: "neutral",
  };
}

export function useGame(
  dictionary: ReadonlySet<string>,
): GameController {
  const [session, setSession] = useState<GameSession>(() => {
    const board = boardAt(0);
    const game = new GameState({
      boardId: board.id,
      durationMs: ROUND_SECONDS * 1000,
      validateWord: validatorFor(dictionary),
      scoreWord,
    });
    const snapshot = pageHasFocus() ? game.getSnapshot() : game.pause();
    return {
      game,
      boardIndex: 0,
      paused: game.isPaused(),
      snapshot,
      roundKey: 0,
      status: READY_STATUS,
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
        snapshot,
        status: snapshot.expired
          ? roundCompleteStatus(snapshot.score)
          : current.status,
      });
    }, 100);

    return () => window.clearInterval(timerId);
  }, [commitSession, endsAt, expired, game, paused]);

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
        paused: game.isPaused(),
        snapshot,
        status: snapshot.expired
          ? roundCompleteStatus(snapshot.score)
          : current.status,
      });
    };

    const resumeRound = () => {
      const current = sessionRef.current;
      if (current.game !== game || !current.paused || !pageHasFocus()) return;

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

  const resetRound = useCallback((advanceBoard: boolean) => {
    const current = sessionRef.current;
    setPath([]);
    const boardIndex = advanceBoard
      ? (current.boardIndex + 1) % BOARDS.length
      : current.boardIndex;
    const board = boardAt(boardIndex);
    let snapshot = current.game.resetRound({
      boardId: board.id,
      durationMs: ROUND_SECONDS * 1000,
    });
    if (!pageHasFocus()) snapshot = current.game.pause();

    commitSession({
      ...current,
      boardIndex,
      paused: current.game.isPaused(),
      snapshot,
      roundKey: current.roundKey + 1,
      status: READY_STATUS,
    });
  }, [commitSession]);

  const board = boardAt(session.boardIndex);
  const currentWord = useMemo(() => {
    if (path.length === 0) return "";
    try {
      return wordFromPath(board.letters, path);
    } catch {
      return "";
    }
  }, [board, path]);

  const onSubmit = useCallback((submittedPath: readonly Coordinate[]) => {
    const current = sessionRef.current;
    const currentBoard = boardAt(current.boardIndex);
    let word: string;
    try {
      word = wordFromPath(currentBoard.letters, submittedPath);
    } catch {
      commitSession({
        ...current,
        status: { text: "That path cannot be used.", tone: "error" },
      });
      return;
    }

    const result = current.game.submitWord({ word, cells: submittedPath });
    commitSession({
      ...current,
      snapshot: result.state,
      status: result.state.expired
        ? roundCompleteStatus(result.state.score)
        : submissionMessage(result),
    });
  }, [commitSession]);

  const playAgain = useCallback(() => resetRound(false), [resetRound]);
  const playNextBoard = useCallback(() => resetRound(true), [resetRound]);
  const isSelectionEnabled = useCallback(() => {
    const current = sessionRef.current;
    return !current.game.isPaused() && !current.game.isExpired();
  }, []);

  const { snapshot } = session;
  const usedCells = new Set(snapshot.usedCells);

  return {
    board,
    currentWord,
    enabled: !snapshot.expired,
    isSelectionEnabled,
    path,
    roundKey: session.roundKey,
    snapshot,
    status: session.status,
    usedCells,
    onPathChange: setPath,
    onSubmit,
    playAgain,
    playNextBoard,
  };
}
