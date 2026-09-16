import { areAdjacent } from "./rules";
import type { Coordinate } from "./types";

const CELL_SELECTOR = "[data-row][data-col]";
const CELL_HITBOX_SCALE = 0.8;

function isCoordinate(value: unknown): value is Coordinate {
  const candidate = value as Partial<Coordinate> | null;
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    Number.isInteger(candidate.row) &&
    Number.isInteger(candidate.col)
  );
}

function isSameCell(first: Coordinate, second: Coordinate): boolean {
  return first.row === second.row && first.col === second.col;
}

/**
 * Return the path produced by moving over candidate without mutating path.
 *
 * A neighboring, unused cell extends the path. Moving back over the
 * immediately preceding cell removes the current cell; other visited cells
 * leave the path unchanged.
 */
export function extendPath(
  path: readonly Coordinate[],
  candidate: unknown,
): readonly Coordinate[] {
  const pathValue: unknown = path;
  if (!Array.isArray(pathValue)) {
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

  const previous = path.at(-2);
  if (isCoordinate(previous) && isSameCell(previous, candidate)) {
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

interface ClosestTarget {
  closest?(selector: string): Element | null;
}

function cellElementFromTarget(
  boardElement: HTMLElement,
  target: EventTarget | null | undefined,
): HTMLElement | null {
  const cell = (target as ClosestTarget | null)?.closest?.(CELL_SELECTOR);
  if (!cell || !boardElement.contains(cell)) {
    return null;
  }

  return cell as HTMLElement;
}

function coordinateFromCell(element: HTMLElement): Coordinate | null {
  const coordinate = {
    row: Number(element.dataset.row),
    col: Number(element.dataset.col),
  };

  return isCoordinate(coordinate) ? coordinate : null;
}

/**
 * Return the tile whose centered 80%-size hit box contains the point.
 *
 * The inset around each hit box prevents a diagonal trace near a tile corner
 * from accidentally selecting one of the horizontal or vertical neighbors.
 */
function cellFromPoint(
  boardElement: HTMLElement,
  target: EventTarget | null | undefined,
  x: number,
  y: number,
): Coordinate | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const cell = cellElementFromTarget(boardElement, target);
  const coordinate = cell === null ? null : coordinateFromCell(cell);
  const rect = cell?.getBoundingClientRect?.();
  if (
    coordinate === null ||
    rect === undefined ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.right) ||
    !Number.isFinite(rect.bottom) ||
    rect.right <= rect.left ||
    rect.bottom <= rect.top
  ) {
    return null;
  }

  const horizontalInset =
    ((rect.right - rect.left) * (1 - CELL_HITBOX_SCALE)) / 2;
  const verticalInset =
    ((rect.bottom - rect.top) * (1 - CELL_HITBOX_SCALE)) / 2;
  return x >= rect.left + horizontalInset &&
    x <= rect.right - horizontalInset &&
    y >= rect.top + verticalInset &&
    y <= rect.bottom - verticalInset
    ? coordinate
    : null;
}

function defaultEnabled(): boolean {
  return true;
}

function noop() {}

export interface SelectionControllerOptions {
  readonly onPathChange?: (path: readonly Coordinate[]) => void;
  readonly onSubmit?: (path: readonly Coordinate[]) => void;
  readonly isEnabled?: () => boolean;
  readonly isCellAvailable?: (coordinate: Coordinate) => boolean;
}

/** Manage pointer-drag word selection for a board element. */
export class SelectionController {
  private readonly boardElement: HTMLElement;
  private readonly document: Document;
  private readonly onPathChange: (path: readonly Coordinate[]) => void;
  private readonly onSubmit: (path: readonly Coordinate[]) => void;
  private readonly isEnabled: () => boolean;
  private readonly isCellAvailable: (coordinate: Coordinate) => boolean;
  path: readonly Coordinate[] = [];
  private pointerId: number | null = null;

  constructor(
    boardElement: HTMLElement,
    {
      onPathChange = noop,
      onSubmit = noop,
      isEnabled = defaultEnabled,
      isCellAvailable = defaultEnabled,
    }: SelectionControllerOptions = {},
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

  handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointerId !== null || !this.isEnabled()) {
      return;
    }

    const coordinate = cellFromPoint(
      this.boardElement,
      event.target,
      event.clientX,
      event.clientY,
    );
    if (!coordinate || !this.isCellAvailable(coordinate)) {
      return;
    }

    event.preventDefault();
    this.pointerId = event.pointerId;
    this.boardElement.setPointerCapture?.(event.pointerId);
    this.setPath(extendPath([], coordinate));
  };

  handlePointerMove = (event: PointerEvent): void => {
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
    const coordinate = cellFromPoint(
      this.boardElement,
      target,
      event.clientX,
      event.clientY,
    );
    if (!coordinate || !this.isCellAvailable(coordinate)) {
      return;
    }

    const nextPath = extendPath(this.path, coordinate);
    if (nextPath !== this.path) {
      event.preventDefault();
      this.setPath(nextPath);
    }
  };

  handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    const target = this.document.elementFromPoint?.(
      event.clientX,
      event.clientY,
    ) ?? event.target;
    const releaseCoordinate = cellFromPoint(
      this.boardElement,
      target,
      event.clientX,
      event.clientY,
    );
    const releasedOnUnavailableCell =
      releaseCoordinate !== null && !this.isCellAvailable(releaseCoordinate);
    const completedPath =
      releaseCoordinate === null || releasedOnUnavailableCell
        ? this.path
        : extendPath(this.path, releaseCoordinate);
    const submittedPath = completedPath.map((position) => ({ ...position }));
    const shouldSubmit =
      this.isEnabled() &&
      !releasedOnUnavailableCell &&
      submittedPath.length > 0;
    this.finishPointer();
    this.setPath([]);

    if (shouldSubmit) {
      this.onSubmit(submittedPath);
    }
  };

  handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  };

  handleLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  };

  handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.pointerId !== null) {
      event.preventDefault();
      this.cancel();
    }
  };

  private setPath(path: readonly Coordinate[]): void {
    this.path = path;
    this.onPathChange(path.map((position) => ({ ...position })));
  }

  private finishPointer(): void {
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

  cancel(): void {
    if (this.pointerId === null && this.path.length === 0) {
      return;
    }

    this.finishPointer();
    this.setPath([]);
  }

  destroy(): void {
    this.finishPointer();
    this.path = [];
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
