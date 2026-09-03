interface RoundActionsProps {
  readonly expired: boolean;
  readonly onPlayAgain: () => void;
  readonly onPlayNextBoard: () => void;
}

export function RoundActions({
  expired,
  onPlayAgain,
  onPlayNextBoard,
}: RoundActionsProps) {
  return (
    <div className="round-actions">
      {expired && <p>Time’s up!</p>}
      <div>
        <button className="primary-button" type="button" onClick={onPlayAgain}>
          Play again
        </button>
        {expired && (
          <button
            className="secondary-button"
            type="button"
            onClick={onPlayNextBoard}
          >
            Try a new board
          </button>
        )}
      </div>
    </div>
  );
}
