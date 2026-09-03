import { areAdjacent } from "./rules";
import type { Coordinate } from "./types";

const CELL_SELECTOR = "[data-row][data-col]";

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
 * A neighboring, unused cell extends the path. Moving to the cell immediately
 * before the current one removes the current cell, which makes correcting a
 * drag feel natural. All other moves leave the path unchanged.
 */
export function extendPath(
  path: readonly Coordinate[],
  candidate: unknown,
): readonly Coordinate[] {
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

interface ClosestTarget {
  closest?(selector: string): Element | null;
}

interface CellGeometry {
  readonly coordinate: Coordinate;
  readonly rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">;
}

type SnapAxis = "horizontal" | "vertical";

function cellFromTarget(
  boardElement: HTMLElement,
  target: EventTarget | null | undefined,
): Coordinate | null {
  const cell = (target as ClosestTarget | null)?.closest?.(CELL_SELECTOR);
  if (!cell || !boardElement.contains(cell)) {
    return null;
  }

  const element = cell as HTMLElement;
  const coordinate = {
    row: Number(element.dataset.row),
    col: Number(element.dataset.col),
  };

  return isCoordinate(coordinate) ? coordinate : null;
}

function distanceSquaredFromRect(
  x: number,
  y: number,
  rect: CellGeometry["rect"],
): number {
  const horizontalDistance = Math.max(rect.left - x, 0, x - rect.right);
  const verticalDistance = Math.max(rect.top - y, 0, y - rect.bottom);
  return horizontalDistance ** 2 + verticalDistance ** 2;
}

/**
 * Return the cardinal snap lane containing a point relative to the current
 * tile. Corner gaps are in neither lane, so diagonal moves require an exact
 * tile hit.
 */
function snapAxisFromPoint(
  cells: readonly CellGeometry[],
  current: Coordinate | undefined,
  x: number,
  y: number,
): SnapAxis | null {
  if (!isCoordinate(current)) {
    return null;
  }

  let boardLeft = Infinity;
  let boardTop = Infinity;
  let boardRight = -Infinity;
  let boardBottom = -Infinity;
  let rowTop = Infinity;
  let rowBottom = -Infinity;
  let columnLeft = Infinity;
  let columnRight = -Infinity;

  for (const { coordinate, rect } of cells) {
    boardLeft = Math.min(boardLeft, rect.left);
    boardTop = Math.min(boardTop, rect.top);
    boardRight = Math.max(boardRight, rect.right);
    boardBottom = Math.max(boardBottom, rect.bottom);

    if (coordinate.row === current.row) {
      rowTop = Math.min(rowTop, rect.top);
      rowBottom = Math.max(rowBottom, rect.bottom);
    }
    if (coordinate.col === current.col) {
      columnLeft = Math.min(columnLeft, rect.left);
      columnRight = Math.max(columnRight, rect.right);
    }
  }

  const projectedX = Math.min(Math.max(x, boardLeft), boardRight);
  const projectedY = Math.min(Math.max(y, boardTop), boardBottom);
  const inHorizontalLane = projectedY >= rowTop && projectedY <= rowBottom;
  const inVerticalLane =
    projectedX >= columnLeft && projectedX <= columnRight;

  if (inHorizontalLane === inVerticalLane) {
    return null;
  }

  return inHorizontalLane ? "horizontal" : "vertical";
}

function closestCellFromPoint(
  boardElement: HTMLElement,
  x: number,
  y: number,
  current: Coordinate | undefined,
): Coordinate | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !isCoordinate(current)) {
    return null;
  }

  const cells: CellGeometry[] = [];
  for (const cell of boardElement.querySelectorAll<HTMLElement>(CELL_SELECTOR)) {
    const coordinate = cellFromTarget(boardElement, cell);
    const rect = cell.getBoundingClientRect?.();
    if (
      !coordinate ||
      !Number.isFinite(rect?.left) ||
      !Number.isFinite(rect?.top) ||
      !Number.isFinite(rect?.right) ||
      !Number.isFinite(rect?.bottom) ||
      rect.right <= rect.left ||
      rect.bottom <= rect.top
    ) {
      continue;
    }
    cells.push({ coordinate, rect });
  }

  const snapAxis = snapAxisFromPoint(cells, current, x, y);
  if (snapAxis === null) {
    return null;
  }

  let closestCoordinate = null;
  let closestDistance = Infinity;

  for (const { coordinate, rect } of cells) {
    if (
      (snapAxis === "horizontal"
        ? coordinate.row !== current.row
        : coordinate.col !== current.col)
    ) {
      continue;
    }

    const distance = distanceSquaredFromRect(x, y, rect);
    if (Number.isFinite(distance) && distance < closestDistance) {
      closestCoordinate = coordinate;
      closestDistance = distance;
    }
  }

  return closestCoordinate;
}

function cellFromPoint(
  boardElement: HTMLElement,
  target: EventTarget | null | undefined,
  x: number,
  y: number,
  current: Coordinate | undefined,
): Coordinate | null {
  return (
    cellFromTarget(boardElement, target) ??
    closestCellFromPoint(boardElement, x, y, current)
  );
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

  handlePointerDown(event: PointerEvent): void {
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

  handlePointerMove(event: PointerEvent): void {
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
      this.path.at(-1),
    );
    if (!coordinate || !this.isCellAvailable(coordinate)) {
      return;
    }

    const nextPath = extendPath(this.path, coordinate);
    if (nextPath !== this.path) {
      event.preventDefault();
      this.setPath(nextPath);
    }
  }

  handlePointerUp(event: PointerEvent): void {
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
      this.path.at(-1),
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
  }

  handlePointerCancel(event: PointerEvent): void {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  }

  handleLostPointerCapture(event: PointerEvent): void {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.pointerId !== null) {
      event.preventDefault();
      this.cancel();
    }
  }

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
