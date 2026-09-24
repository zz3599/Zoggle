import { useCallback, useMemo, useState } from "react";

import type { WordTrie } from "../board-generation";
import { findHintWord } from "../hint";
import type { Coordinate, LetterGrid } from "../types";

export const HINT_DELAY_MS = 10_000;

const EMPTY_HINT_PATH: readonly Coordinate[] = [];

interface UseHintOptions {
  readonly active: boolean;
  readonly blockedCells: readonly string[];
  readonly board: LetterGrid;
  readonly remainingMs: number;
  readonly trie: WordTrie;
}

export interface HintController {
  readonly path: readonly Coordinate[];
  readonly resetCountdown: (remainingMs: number) => void;
}

/** Own the no-success countdown and select one currently playable hint path. */
export function useHint({
  active,
  blockedCells,
  board,
  remainingMs,
  trie,
}: UseHintOptions): HintController {
  const [countdownStartedAtRemainingMs, setCountdownStartedAtRemainingMs] =
    useState(remainingMs);
  const resetCountdown = useCallback((nextRemainingMs: number) => {
    setCountdownStartedAtRemainingMs(nextRemainingMs);
  }, []);
  const hintDue =
    active &&
    remainingMs <= countdownStartedAtRemainingMs - HINT_DELAY_MS;
  const blockedCellsKey = blockedCells.join("\0");

  const hint = useMemo(() => {
    if (!hintDue) return null;

    return findHintWord(board, trie, {
      blockedCells: blockedCellsKey ? blockedCellsKey.split("\0") : [],
    });
  }, [blockedCellsKey, board, hintDue, trie]);

  return {
    path: hint?.path ?? EMPTY_HINT_PATH,
    resetCountdown,
  };
}
