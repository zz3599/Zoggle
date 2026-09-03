import { ROUND_SECONDS } from "../config";
import type { RoundSnapshot } from "../game-state";

interface StatsProps {
  readonly snapshot: RoundSnapshot | null;
}

function formatTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function Stats({ snapshot }: StatsProps) {
  const remainingMs = snapshot?.remainingMs ?? ROUND_SECONDS * 1000;
  const urgent = snapshot !== null && !snapshot.expired && remainingMs <= 10_000;

  return (
    <section className="stats" aria-label="Round statistics">
      <div className="stat">
        <span className="stat-label">Time</span>
        <strong
          id="timer-value"
          className={`stat-value${urgent ? " stat-value--urgent" : ""}`}
        >
          {formatTime(remainingMs)}
        </strong>
      </div>
      <div className="stat">
        <span className="stat-label">Score</span>
        <strong id="score-value" className="stat-value">
          {snapshot?.score ?? 0}
        </strong>
      </div>
      <div className="stat">
        <span className="stat-label">Board best</span>
        <strong id="high-score-value" className="stat-value">
          {snapshot?.highScore ?? 0}
        </strong>
      </div>
    </section>
  );
}
