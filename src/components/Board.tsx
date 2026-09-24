import { useMemo, useRef, type CSSProperties } from "react";

import type { GravityTileFall } from "../endless-board";
import { useSelectionController } from "../hooks/use-selection-controller";
import type { BoardDefinition, Coordinate } from "../types";

interface BoardProps {
  readonly board: BoardDefinition;
  readonly cascadeCells: ReadonlySet<string>;
  readonly enabled: boolean;
  readonly gravityFalls: readonly GravityTileFall[];
  readonly gravityKey: number;
  readonly hintPath: readonly Coordinate[];
  readonly isEnabled: () => boolean;
  readonly path: readonly Coordinate[];
  readonly resetKey: number;
  readonly resolving: boolean;
  readonly usedCells: ReadonlySet<string>;
  readonly onPathChange: (path: readonly Coordinate[]) => void;
  readonly onSubmit: (path: readonly Coordinate[]) => void;
}

function cellKey({ row, col }: Coordinate): string {
  return `${row},${col}`;
}

function fallOffset(fallRows: number): string {
  if (fallRows <= 0) return "0px";

  const gapOffsets = Array.from(
    { length: fallRows },
    () => "var(--board-gap)",
  ).join(" - ");
  return `calc(-${fallRows * 100}% - ${gapOffsets})`;
}

export function Board({
  board,
  cascadeCells,
  enabled,
  gravityFalls,
  gravityKey,
  hintPath,
  isEnabled,
  path,
  resetKey,
  resolving,
  usedCells,
  onPathChange,
  onSubmit,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const activeCells = useMemo(() => new Set(path.map(cellKey)), [path]);
  const hintSteps = useMemo(
    () => new Map(hintPath.map((coordinate, index) => [
      cellKey(coordinate),
      index + 1,
    ])),
    [hintPath],
  );
  const fallsByDestination = useMemo(
    () => new Map(
      gravityFalls.map((fall) => [cellKey(fall.destination), fall]),
    ),
    [gravityFalls],
  );
  const boardLabel = board.label ?? `${board.id} board`;
  const selectionEnabled = enabled && !resolving;

  useSelectionController({
    boardRef,
    enabled: selectionEnabled,
    isEnabled: () => !resolving && isEnabled(),
    isCellAvailable: (coordinate) => !usedCells.has(cellKey(coordinate)),
    onPathChange,
    onSubmit,
    resetKey,
  });

  const boardStyle = {
    "--board-size": board.letters.length,
  } as CSSProperties;

  return (
    <div className="board-viewport">
      <div
        ref={boardRef}
        className={[
          "board",
          !enabled && "board--disabled",
          resolving && "board--resolving",
        ].filter(Boolean).join(" ")}
        role="group"
        aria-busy={resolving}
        aria-disabled={!selectionEnabled}
        aria-label={`${boardLabel}, ${board.letters.length} by ${board.letters.length}`}
        style={boardStyle}
      >
        {board.letters.flatMap((row, rowIndex) =>
          row.map((letter, colIndex) => {
            const key = `${rowIndex},${colIndex}`;
            const used = usedCells.has(key);
            const active = activeCells.has(key);
            const hintStep = hintSteps.get(key);
            const hinted = hintStep !== undefined;
            const cascade = cascadeCells.has(key);
            const fall = fallsByDestination.get(key);
            const className = [
              "cell",
              used && "cell--used",
              active && "cell--active",
              hinted && "cell--hint",
              fall && "cell--falling",
              fall?.spawned && "cell--spawned",
              cascade && "cell--cascade",
            ]
              .filter(Boolean)
              .join(" ");
            const cellStyle = fall || hinted
              ? {
                  ...(fall && {
                    "--fall-offset": fallOffset(fall.fallRows),
                  }),
                  ...(hinted && {
                    "--hint-delay": `${(hintStep - 1) * 140}ms`,
                  }),
                } as CSSProperties
              : undefined;
            const animationKey = fall
              ? `gravity-${gravityKey}`
              : cascade
                ? `cascade-${gravityKey}`
                : "settled";

            return (
              <div key={key} className="cell-slot">
                <button
                  key={`${key}:${animationKey}`}
                  type="button"
                  className={className}
                  data-row={rowIndex}
                  data-col={colIndex}
                  data-fall-rows={fall?.fallRows}
                  data-gravity={
                    fall ? (fall.spawned ? "spawned" : "falling") : undefined
                  }
                  data-hint-step={hintStep}
                  data-source-row={fall?.sourceRow ?? undefined}
                  aria-label={
                    `${letter}, row ${rowIndex + 1}, column ${colIndex + 1}` +
                    (hinted
                      ? `, hint step ${hintStep} of ${hintPath.length}`
                      : "")
                  }
                  disabled={!selectionEnabled || used}
                  style={cellStyle}
                >
                  {letter}
                </button>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
