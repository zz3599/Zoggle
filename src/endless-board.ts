import { DEFAULT_LETTER_POOL } from "./letter-pool";
import type { BoardDefinition, Coordinate } from "./types";

export type RandomSource = () => number;

export interface GravityBoardOptions {
  readonly letterPool?: string | readonly string[];
  readonly random?: RandomSource;
}

export interface GravityTileFall {
  readonly destination: Coordinate;
  /** The tile's row before gravity, or null when the tile was newly spawned. */
  readonly sourceRow: number | null;
  /** The number of board rows travelled to reach `destination`. */
  readonly fallRows: number;
  readonly spawned: boolean;
}

export interface GravityBoardResult {
  readonly board: BoardDefinition;
  /** Spawned and moved tiles, ordered by destination row then column. */
  readonly falls: readonly GravityTileFall[];
  /** Destinations whose contents changed, suitable as the next cascade frontier. */
  readonly frontier: readonly Coordinate[];
}

const ASCII_LETTER = /^[A-Za-z]$/;

function normalizeLetterPool(
  value: string | readonly string[],
): readonly string[] {
  const letters = typeof value === "string" ? [...value] : value;
  if (letters.length === 0) {
    throw new RangeError("The Endless letter pool must not be empty.");
  }

  return letters.map((letter) => {
    if (typeof letter !== "string" || !ASCII_LETTER.test(letter)) {
      throw new TypeError(
        "The Endless letter pool may contain only single ASCII letters.",
      );
    }
    return letter.toUpperCase();
  });
}

function pickFromPool(
  letterPool: readonly string[],
  random: RandomSource,
): string {
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("The Endless random source must return a value in [0, 1).");
  }

  return letterPool[Math.floor(randomValue * letterPool.length)]!;
}

function coordinateKey({ row, col }: Coordinate): string {
  return `${row},${col}`;
}

function validatedRemovedCells(
  board: BoardDefinition,
  cells: readonly Coordinate[],
): ReadonlySet<string> {
  const removedCells = new Set<string>();

  for (const { row, col } of cells) {
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      col < 0 ||
      row >= board.letters.length ||
      col >= (board.letters[row]?.length ?? 0)
    ) {
      throw new RangeError("An Endless removal cell is outside the board.");
    }

    removedCells.add(coordinateKey({ row, col }));
  }

  return removedCells;
}

function compareFallsByDestination(
  first: GravityTileFall,
  second: GravityTileFall,
): number {
  return first.destination.row - second.destination.row ||
    first.destination.col - second.destination.col;
}

/**
 * Remove cells, settle each affected column downward, and spawn replacement
 * letters above it. The returned movement data describes the settled board and
 * never mutates the source board.
 */
export function applyBoardGravity(
  board: BoardDefinition,
  cells: readonly Coordinate[],
  {
    letterPool = DEFAULT_LETTER_POOL,
    random = Math.random,
  }: GravityBoardOptions = {},
): GravityBoardResult {
  if (cells.length === 0) {
    return { board, falls: [], frontier: [] };
  }

  const removedCells = validatedRemovedCells(board, cells);
  const normalizedPool = normalizeLetterPool(letterPool);
  const letters = board.letters.map((row) => [...row]);
  const affectedColumns = new Set<number>();
  const falls: GravityTileFall[] = [];

  for (const { col } of cells) {
    affectedColumns.add(col);
  }

  for (const col of [...affectedColumns].sort((first, second) => first - second)) {
    const survivors: Array<{ readonly letter: string; readonly sourceRow: number }> = [];

    for (let row = 0; row < board.letters.length; row += 1) {
      const letter = board.letters[row]?.[col];
      if (letter === undefined) {
        throw new RangeError("Endless gravity requires a rectangular board.");
      }
      if (!removedCells.has(coordinateKey({ row, col }))) {
        survivors.push({ letter, sourceRow: row });
      }
    }

    const spawnCount = board.letters.length - survivors.length;
    for (let destinationRow = 0; destinationRow < spawnCount; destinationRow += 1) {
      letters[destinationRow]![col] = pickFromPool(normalizedPool, random);
      falls.push({
        destination: { row: destinationRow, col },
        sourceRow: null,
        fallRows: spawnCount,
        spawned: true,
      });
    }

    for (let survivorIndex = 0; survivorIndex < survivors.length; survivorIndex += 1) {
      const survivor = survivors[survivorIndex]!;
      const destinationRow = spawnCount + survivorIndex;
      const fallRows = destinationRow - survivor.sourceRow;
      letters[destinationRow]![col] = survivor.letter;
      if (fallRows === 0) continue;

      falls.push({
        destination: { row: destinationRow, col },
        sourceRow: survivor.sourceRow,
        fallRows,
        spawned: false,
      });
    }
  }

  falls.sort(compareFallsByDestination);
  const frontier = falls.map(({ destination }) => destination);
  return {
    board: { ...board, letters },
    falls,
    frontier,
  };
}
