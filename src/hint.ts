import {
  solveBoard,
  type BoardInput,
  type TraceableWord,
  type WordTrie,
} from "./board-generation";
import type { Coordinate } from "./types";

export interface FindHintWordOptions {
  /** Cells that are unavailable in the current game mode. */
  readonly blockedCells?: Iterable<Coordinate | string>;
}

/** Find the easiest currently playable word using deterministic tie-breakers. */
export function findHintWord(
  board: BoardInput,
  trie: WordTrie,
  {
    blockedCells = [],
  }: FindHintWordOptions = {},
): TraceableWord | null {
  let best: TraceableWord | null = null;

  for (const candidate of solveBoard(board, trie, { blockedCells })) {
    if (
      best === null ||
      candidate.word.length < best.word.length ||
      (candidate.word.length === best.word.length &&
        candidate.word < best.word)
    ) {
      best = candidate;
    }
  }

  return best;
}
