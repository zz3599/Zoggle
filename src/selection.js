import { areAdjacent } from "./rules.js";

const CELL_SELECTOR = "[data-row][data-col]";

function isCoordinate(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isInteger(value.row) &&
    Number.isInteger(value.col)
  );
}

function isSameCell(first, second) {
  return first.row === second.row && first.col === second.col;
}

/**
 * Return the path produced by moving over candidate without mutating path.
 *
 * A neighboring, unused cell extends the path. Moving to the cell immediately
 * before the current one removes the current cell, which makes correcting a
 * drag feel natural. All other moves leave the path unchanged.
 */
export function extendPath(path, candidate) {
  if (!Array.isArray(path)) {
    throw new TypeError("path must be an array");
  }

  if (!isCoordinate(candidate)) {
    return path;
  }

  if (path.length === 0) {
    return [{ row: candidate.row, col: candidate.col }];
  }

  const current = path.at(-1);
  if (!isCoordinate(current) || isSameCell(current, candidate)) {
    return path;
  }

  const predecessor = path.at(-2);
  if (predecessor && isSameCell(predecessor, candidate)) {
    return path.slice(0, -1);
  }

  if (
    path.some((position) =>
      isCoordinate(position) && isSameCell(position, candidate),
    ) ||
    !areAdjacent(current, candidate)
  ) {
    return path;
  }

  return [...path, { row: candidate.row, col: candidate.col }];
}

function cellFromTarget(boardElement, target) {
  const cell = target?.closest?.(CELL_SELECTOR);
  if (!cell || !boardElement.contains(cell)) {
    return null;
  }

  const coordinate = {
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
  };

  return isCoordinate(coordinate) ? coordinate : null;
}

function defaultEnabled() {
  return true;
}

function noop() {}

/** Manage pointer-drag word selection for a board element. */
export class SelectionController {
  constructor(
    boardElement,
    {
      onPathChange = noop,
      onSubmit = noop,
      isEnabled = defaultEnabled,
      isCellAvailable = defaultEnabled,
    } = {},
  ) {
    if (!boardElement?.addEventListener || !boardElement?.contains) {
      throw new TypeError("boardElement must be a DOM element");
    }
    if (
      typeof onPathChange !== "function" ||
      typeof onSubmit !== "function" ||
      typeof isEnabled !== "function" ||
      typeof isCellAvailable !== "function"
    ) {
      throw new TypeError("selection callbacks and predicates must be functions");
    }

    this.boardElement = boardElement;
    this.document = boardElement.ownerDocument;
    this.onPathChange = onPathChange;
    this.onSubmit = onSubmit;
    this.isEnabled = isEnabled;
    this.isCellAvailable = isCellAvailable;
    this.path = [];
    this.pointerId = null;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleLostPointerCapture = this.handleLostPointerCapture.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    boardElement.addEventListener("pointerdown", this.handlePointerDown);
    boardElement.addEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture,
    );
    this.document.addEventListener("pointermove", this.handlePointerMove);
    this.document.addEventListener("pointerup", this.handlePointerUp);
    this.document.addEventListener("pointercancel", this.handlePointerCancel);
    this.document.addEventListener("keydown", this.handleKeyDown);
  }

  handlePointerDown(event) {
    if (event.button !== 0 || this.pointerId !== null || !this.isEnabled()) {
      return;
    }

    const coordinate = cellFromTarget(this.boardElement, event.target);
    if (!coordinate || !this.isCellAvailable(coordinate)) {
      return;
    }

    event.preventDefault();
    this.pointerId = event.pointerId;
    this.boardElement.setPointerCapture?.(event.pointerId);
    this.setPath(extendPath([], coordinate));
  }

  handlePointerMove(event) {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    if (!this.isEnabled()) {
      this.cancel();
      return;
    }

    const target = this.document.elementFromPoint?.(
      event.clientX,
      event.clientY,
    );
    const coordinate = cellFromTarget(this.boardElement, target);
    if (!coordinate || !this.isCellAvailable(coordinate)) {
      return;
    }

    const nextPath = extendPath(this.path, coordinate);
    if (nextPath !== this.path) {
      event.preventDefault();
      this.setPath(nextPath);
    }
  }

  handlePointerUp(event) {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    const target = this.document.elementFromPoint?.(
      event.clientX,
      event.clientY,
    ) ?? event.target;
    const releaseCoordinate = cellFromTarget(this.boardElement, target);
    const releasedOnUnavailableCell =
      releaseCoordinate !== null && !this.isCellAvailable(releaseCoordinate);
    const submittedPath = this.path.map((position) => ({ ...position }));
    const shouldSubmit =
      this.isEnabled() &&
      !releasedOnUnavailableCell &&
      submittedPath.length > 0;
    this.finishPointer();
    this.setPath([]);

    if (shouldSubmit) {
      this.onSubmit(submittedPath);
    }
  }

  handlePointerCancel(event) {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  }

  handleLostPointerCapture(event) {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.pointerId !== null) {
      event.preventDefault();
      this.cancel();
    }
  }

  setPath(path) {
    this.path = path;
    this.onPathChange(path.map((position) => ({ ...position })));
  }

  finishPointer() {
    const pointerId = this.pointerId;
    this.pointerId = null;

    if (pointerId === null) {
      return;
    }

    try {
      if (this.boardElement.hasPointerCapture?.(pointerId)) {
        this.boardElement.releasePointerCapture(pointerId);
      }
    } catch {
      // Browsers can release capture automatically before pointerup is handled.
    }
  }

  cancel() {
    if (this.pointerId === null && this.path.length === 0) {
      return;
    }

    this.finishPointer();
    this.setPath([]);
  }

  destroy() {
    this.cancel();
    this.boardElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.boardElement.removeEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture,
    );
    this.document.removeEventListener("pointermove", this.handlePointerMove);
    this.document.removeEventListener("pointerup", this.handlePointerUp);
    this.document.removeEventListener("pointercancel", this.handlePointerCancel);
    this.document.removeEventListener("keydown", this.handleKeyDown);
  }
}
