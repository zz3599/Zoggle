function isCoordinate(position) {
  return (
    position !== null &&
    typeof position === "object" &&
    Number.isInteger(position.row) &&
    Number.isInteger(position.col)
  );
}

/** Return whether two different cells touch horizontally, vertically, or diagonally. */
export function areAdjacent(first, second) {
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
export function isInBounds(board, position) {
  return (
    Array.isArray(board) &&
    isCoordinate(position) &&
    position.row >= 0 &&
    position.row < board.length &&
    Array.isArray(board[position.row]) &&
    position.col >= 0 &&
    position.col < board[position.row].length
  );
}

/** Validate a non-empty path without allowing a cell to be used twice. */
export function isValidPath(board, path) {
  if (!Array.isArray(path) || path.length === 0) {
    return false;
  }

  const visited = new Set();

  for (let index = 0; index < path.length; index += 1) {
    const position = path[index];

    if (!isInBounds(board, position)) {
      return false;
    }

    const key = `${position.row}:${position.col}`;
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);

    if (index > 0 && !areAdjacent(path[index - 1], position)) {
      return false;
    }
  }

  return true;
}

/** Build the lowercase dictionary word represented by a valid board path. */
export function wordFromPath(board, path) {
  if (!isValidPath(board, path)) {
    throw new RangeError(
      "A word path must contain unique, adjacent cells within the board.",
    );
  }

  return path
    .map(({ row, col }) => String(board[row][col]).toLowerCase())
    .join("");
}

function collectionHas(collection, word) {
  if (collection === null || collection === undefined) {
    return false;
  }

  if (typeof collection.has === "function") {
    return collection.has(word);
  }

  if (Array.isArray(collection)) {
    return collection.includes(word);
  }

  if (typeof collection === "object") {
    return Object.hasOwn(collection, word);
  }

  return false;
}

/** Check spelling, length, dictionary membership, and prior submissions. */
export function isEligibleWord(word, dictionary, submittedWords = new Set()) {
  return (
    typeof word === "string" &&
    /^[a-z]{3,}$/.test(word) &&
    collectionHas(dictionary, word) &&
    !collectionHas(submittedWords, word)
  );
}

/** Score a word using the bands defined in the gameplay specification. */
export function scoreWord(word) {
  const length = typeof word === "string" ? word.length : 0;

  if (length < 3) return 0;
  if (length <= 4) return 1;
  if (length === 5) return 2;
  if (length === 6) return 3;
  if (length === 7) return 4;
  if (length === 8) return 11;
  return 20;
}
