import { DEFAULT_LETTER_POOL } from "./letter-pool";
import type { BoardDefinition, Coordinate } from "./types";

export type RandomSource = () => number;

export interface ReplenishBoardOptions {
  readonly letterPool?: string | readonly string[];
  readonly random?: RandomSource;
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

function pickReplacement(
  currentLetter: string,
  letterPool: readonly string[],
  random: RandomSource,
): string {
  const alternatives = letterPool.filter((letter) => letter !== currentLetter);
  const candidates = alternatives.length > 0 ? alternatives : letterPool;
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("The Endless random source must return a value in [0, 1).");
  }

  return candidates[Math.floor(randomValue * candidates.length)]!;
}

/**
 * Replace only the submitted tiles using the generator's English-frequency
 * pool. This deliberately avoids re-solving the board so a refill is instant.
 */
export function replenishBoard(
  board: BoardDefinition,
  cells: readonly Coordinate[],
  {
    letterPool = DEFAULT_LETTER_POOL,
    random = Math.random,
  }: ReplenishBoardOptions = {},
): BoardDefinition {
  if (cells.length === 0) return board;

  const normalizedPool = normalizeLetterPool(letterPool);
  const letters = [...board.letters];
  const mutableRows = new Map<number, string[]>();
  const replacedCells = new Set<string>();

  for (const { row, col } of cells) {
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      col < 0 ||
      row >= letters.length ||
      col >= (letters[row]?.length ?? 0)
    ) {
      throw new RangeError("An Endless replacement cell is outside the board.");
    }

    const key = `${row},${col}`;
    if (replacedCells.has(key)) continue;
    replacedCells.add(key);

    let mutableRow = mutableRows.get(row);
    if (mutableRow === undefined) {
      mutableRow = [...letters[row]!];
      mutableRows.set(row, mutableRow);
      letters[row] = mutableRow;
    }

    const currentLetter = mutableRow[col]!;
    mutableRow[col] = pickReplacement(
      currentLetter,
      normalizedPool,
      random,
    );
  }

  return { ...board, letters };
}
