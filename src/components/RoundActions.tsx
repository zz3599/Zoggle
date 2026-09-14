export type FreshBoardStatus =
  | "idle"
  | "generating"
  | "success"
  | "cancelled"
  | "error";

interface RoundActionsProps {
  readonly expired: boolean;
  readonly freshBoardStatus: FreshBoardStatus;
  readonly onGenerateFreshBoard: () => void;
  readonly onPlayAgain: () => void;
  readonly onPlayNextBoard: () => void;
}

export function RoundActions({
  expired,
  freshBoardStatus,
  onGenerateFreshBoard,
  onPlayAgain,
  onPlayNextBoard,
}: RoundActionsProps) {
  const freshBoardMessage = {
    cancelled: "Fresh-board generation cancelled.",
    error: "Couldn’t generate a fresh board. Try again.",
    generating: "Searching for a fresh board…",
    idle: "",
    success: "Fresh board ready.",
  }[freshBoardStatus];

  return (
    <div className="round-actions">
      <div className="round-actions__messages">
        {expired && <p>Time’s up!</p>}
        <p
          id="fresh-board-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-tone={freshBoardStatus === "error" ? "error" : "neutral"}
        >
          {freshBoardMessage}
        </p>
      </div>
      <div className="round-actions__buttons">
        <button
          className="primary-button"
          type="button"
          disabled={freshBoardStatus === "generating"}
          onClick={onPlayAgain}
        >
          Play again
        </button>
        {expired && (
          <button
            className="secondary-button"
            type="button"
            disabled={freshBoardStatus === "generating"}
            onClick={onPlayNextBoard}
          >
            Try a new board
          </button>
        )}
        <button
          className="secondary-button"
          type="button"
          aria-describedby={
            freshBoardMessage ? "fresh-board-status" : undefined
          }
          onClick={onGenerateFreshBoard}
        >
          {freshBoardStatus === "generating"
            ? "Cancel generation"
            : "Generate fresh board"}
        </button>
      </div>
    </div>
  );
}
