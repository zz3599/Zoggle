import type { Coordinate, LetterGrid } from "./types";

function isCoordinate(position: unknown): position is Coordinate {
  const candidate = position as Partial<Coordinate> | null;
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    Number.isInteger(candidate.row) &&
    Number.isInteger(candidate.col)
  );
}

/** Return whether two different cells touch horizontally, vertically, or diagonally. */
export function areAdjacent(first: unknown, second: unknown): boolean {
  if (!isCoordinate(first) || !isCoordinate(second)) {
    return false;
  }

  const rowDistance = Math.abs(first.row - second.row);
  const colDistance = Math.abs(first.col - second.col);

  return (
    (rowDistance !== 0 || colDistance !== 0) &&
    rowDistance <= 1 &&
    colDistance <= 1
  );
}

/** Return whether a coordinate identifies a cell on the supplied board. */
export function isInBounds(
  board: LetterGrid,
  position: unknown,
): position is Coordinate {
  const row = isCoordinate(position) ? board[position.row] : undefined;
  return (
    isCoordinate(position) &&
    position.row >= 0 &&
    position.row < board.length &&
    Array.isArray(row) &&
    position.col >= 0 &&
    position.col < row.length
  );
}

/** Validate a non-empty path without allowing a cell to be used twice. */
export function isValidPath(
  board: LetterGrid,
  path: unknown,
): path is readonly Coordinate[] {
  if (!Array.isArray(path) || path.length === 0) {
    return false;
  }

  const positions: readonly unknown[] = path;
  const visited = new Set<string>();

  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];

    if (!isInBounds(board, position)) {
      return false;
    }

    const key = `${position.row}:${position.col}`;
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);

    if (index > 0 && !areAdjacent(positions[index - 1], position)) {
      return false;
    }
  }

  return true;
}

/** Build the lowercase dictionary word represented by a valid board path. */
export function wordFromPath(board: LetterGrid, path: readonly Coordinate[]): string {
  if (!isValidPath(board, path)) {
    throw new RangeError(
      "A word path must contain unique, adjacent cells within the board.",
    );
  }

  return path
    .map(({ row, col }) => String(board[row]![col]).toLowerCase())
    .join("");
}

function collectionHas(collection: unknown, word: string): boolean {
  if (collection === null || collection === undefined) {
    return false;
  }

  if (typeof collection === "object" && "has" in collection) {
    const has = (collection as { readonly has?: unknown }).has;
    if (typeof has === "function") {
      return (has as (value: string) => boolean).call(collection, word);
    }
  }

  if (Array.isArray(collection)) {
    const values: readonly unknown[] = collection;
    return values.includes(word);
  }

  if (typeof collection === "object") {
    return Object.hasOwn(collection, word);
  }

  return false;
}

/** Check spelling, length, dictionary membership, and prior submissions. */
export function isEligibleWord(
  word: unknown,
  dictionary: unknown,
  submittedWords: unknown = new Set<string>(),
): boolean {
  return (
    typeof word === "string" &&
    /^[a-z]{3,}$/.test(word) &&
    collectionHas(dictionary, word) &&
    !collectionHas(submittedWords, word)
  );
}

/** Score a word using the bands defined in the gameplay specification. */
export function scoreWord(word: unknown): number {
  const length = typeof word === "string" ? word.length : 0;

  if (length < 3) return 0;
  if (length <= 4) return 1;
  if (length === 5) return 2;
  if (length === 6) return 3;
  if (length === 7) return 4;
  if (length === 8) return 11;
  return 20;
}
