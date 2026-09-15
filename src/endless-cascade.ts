import {
  solveBoard,
  type BoardInput,
  type TraceableWord,
  type WordTrie,
} from "./board-generation";
import { scoreWord } from "./rules";
import type { Coordinate } from "./types";

/** Prevent a word-dense Endless board from cascading without yielding control. */
export const MAX_CASCADE_DEPTH = 8;

export interface CascadeCandidate extends TraceableWord {
  readonly score: number;
  readonly frontierCellCount: number;
  /** Total rows surviving tiles would fall if this path were removed. */
  readonly projectedGravityPotential: number;
}

export interface FindBestCascadeCandidateOptions {
  /** The settled board immediately before the gravity step. */
  readonly beforeBoard: BoardInput;
  /** The settled board after removed cells fell and new letters arrived. */
  readonly afterBoard: BoardInput;
  /** Destinations occupied by a fallen or newly spawned tile. */
  readonly frontier: readonly Coordinate[];
  readonly trie: WordTrie;
  /** Words already awarded during this round. */
  readonly excludedWords?: Iterable<string>;
}

function coordinateKey({ row, col }: Coordinate): string {
  return `${row},${col}`;
}

function compareStrings(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function comparePaths(
  first: readonly Coordinate[],
  second: readonly Coordinate[],
): number {
  const sharedLength = Math.min(first.length, second.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const firstPosition = first[index]!;
    const secondPosition = second[index]!;
    const rowDifference = firstPosition.row - secondPosition.row;
    if (rowDifference !== 0) return rowDifference;

    const columnDifference = firstPosition.col - secondPosition.col;
    if (columnDifference !== 0) return columnDifference;
  }

  return first.length - second.length;
}

function columnCount(board: BoardInput): number {
  const firstRow = board[0];
  return typeof firstRow === "string"
    ? firstRow.length
    : (firstRow?.length ?? 0);
}

/**
 * Measure how much existing board material a removal would move.
 *
 * A survivor falls once for every removed cell below it in the same column.
 * Spawned letters are deliberately excluded because every candidate spawns
 * exactly one letter per removed path cell.
 */
function projectedGravityPotential(
  board: BoardInput,
  path: readonly Coordinate[],
): number {
  const removedRowsByColumn = new Map<number, Set<number>>();
  for (const { row, col } of path) {
    let removedRows = removedRowsByColumn.get(col);
    if (removedRows === undefined) {
      removedRows = new Set<number>();
      removedRowsByColumn.set(col, removedRows);
    }
    removedRows.add(row);
  }

  let potential = 0;
  const columns = columnCount(board);
  for (let col = 0; col < columns; col += 1) {
    const removedRows = removedRowsByColumn.get(col);
    if (removedRows === undefined) continue;

    for (let row = 0; row < board.length; row += 1) {
      if (removedRows.has(row)) continue;
      for (const removedRow of removedRows) {
        if (removedRow > row) potential += 1;
      }
    }
  }

  return potential;
}

/** Sort best-first according to the Endless cascade policy. */
export function compareCascadeCandidates(
  first: CascadeCandidate,
  second: CascadeCandidate,
): number {
  const lengthDifference = second.word.length - first.word.length;
  if (lengthDifference !== 0) return lengthDifference;

  const scoreDifference = second.score - first.score;
  if (scoreDifference !== 0) return scoreDifference;

  const frontierDifference =
    second.frontierCellCount - first.frontierCellCount;
  if (frontierDifference !== 0) return frontierDifference;

  const gravityDifference =
    second.projectedGravityPotential - first.projectedGravityPotential;
  if (gravityDifference !== 0) return gravityDifference;

  const wordDifference = compareStrings(first.word, second.word);
  return wordDifference !== 0
    ? wordDifference
    : comparePaths(first.path, second.path);
}

/**
 * Select one genuinely new word for the next automatic Endless cascade.
 *
 * `solveBoard` supplies a stable representative path for each unique word.
 * Requiring that path to touch the gravity frontier keeps cascades causally
 * tied to the preceding fall, in addition to the pre/post word-set check.
 */
export function findBestCascadeCandidate({
  beforeBoard,
  afterBoard,
  frontier,
  trie,
  excludedWords = [],
}: FindBestCascadeCandidateOptions): CascadeCandidate | null {
  if (frontier.length === 0) return null;

  const wordsBeforeGravity = new Set(
    solveBoard(beforeBoard, trie).map(({ word }) => word),
  );
  const excluded = new Set(excludedWords);
  const frontierKeys = new Set(frontier.map(coordinateKey));

  const candidates: CascadeCandidate[] = [];
  for (const trace of solveBoard(afterBoard, trie)) {
    if (wordsBeforeGravity.has(trace.word) || excluded.has(trace.word)) {
      continue;
    }

    let frontierCellCount = 0;
    for (const position of trace.path) {
      if (frontierKeys.has(coordinateKey(position))) {
        frontierCellCount += 1;
      }
    }
    if (frontierCellCount === 0) continue;

    candidates.push({
      ...trace,
      score: scoreWord(trace.word),
      frontierCellCount,
      projectedGravityPotential: projectedGravityPotential(
        afterBoard,
        trace.path,
      ),
    });
  }

  candidates.sort(compareCascadeCandidates);
  return candidates[0] ?? null;
}
