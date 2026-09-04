import { useMemo, useRef, type CSSProperties } from "react";

import { useSelectionController } from "../hooks/use-selection-controller";
import type { BoardDefinition, Coordinate } from "../types";

interface BoardProps {
  readonly board: BoardDefinition;
  readonly enabled: boolean;
  readonly isEnabled: () => boolean;
  readonly path: readonly Coordinate[];
  readonly resetKey: number;
  readonly usedCells: ReadonlySet<string>;
  readonly onPathChange: (path: readonly Coordinate[]) => void;
  readonly onSubmit: (path: readonly Coordinate[]) => void;
}

function cellKey({ row, col }: Coordinate): string {
  return `${row},${col}`;
}

export function Board({
  board,
  enabled,
  isEnabled,
  path,
  resetKey,
  usedCells,
  onPathChange,
  onSubmit,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const activeCells = useMemo(() => new Set(path.map(cellKey)), [path]);
  const boardLabel = board.label ?? `${board.id} board`;

  useSelectionController({
    boardRef,
    enabled,
    isEnabled,
    isCellAvailable: (coordinate) => !usedCells.has(cellKey(coordinate)),
    onPathChange,
    onSubmit,
    resetKey,
  });

  const boardStyle = {
    "--board-size": board.letters.length,
  } as CSSProperties;

  return (
    <div
      ref={boardRef}
      className={`board${enabled ? "" : " board--disabled"}`}
      role="group"
      aria-disabled={!enabled}
      aria-label={`${boardLabel}, ${board.letters.length} by ${board.letters.length}`}
      style={boardStyle}
    >
      {board.letters.flatMap((row, rowIndex) =>
        row.map((letter, colIndex) => {
          const key = `${rowIndex},${colIndex}`;
          const used = usedCells.has(key);
          const active = activeCells.has(key);
          const className = [
            "cell",
            used && "cell--used",
            active && "cell--active",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={key}
              type="button"
              className={className}
              data-row={rowIndex}
              data-col={colIndex}
              aria-label={`${letter}, row ${rowIndex + 1}, column ${colIndex + 1}`}
              disabled={!enabled || used}
            >
              {letter}
            </button>
          );
        }),
      )}
    </div>
  );
}
