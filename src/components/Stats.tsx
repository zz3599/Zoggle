import { ROUND_SECONDS } from "../config";
import type { RoundSnapshot } from "../game-state";
import type { TimeBonus } from "../types";

interface StatsProps {
  readonly snapshot: RoundSnapshot | null;
  readonly timeBonus: TimeBonus | null;
}

function formatTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatBonusSeconds(seconds: number): string {
  return Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function Stats({ snapshot, timeBonus }: StatsProps) {
  const remainingMs = snapshot?.remainingMs ?? ROUND_SECONDS * 1000;
  const urgent = snapshot !== null && !snapshot.expired && remainingMs <= 10_000;
  const bonusSeconds = timeBonus === null
    ? ""
    : formatBonusSeconds(timeBonus.seconds);
  const bonusAnnouncement = timeBonus === null
    ? ""
    : `${bonusSeconds} ${timeBonus.seconds === 1 ? "second" : "seconds"} added`;
  const announcementChannel = timeBonus === null ? -1 : timeBonus.key % 2;

  return (
    <section className="stats" aria-label="Round statistics">
      <div className="stat">
        <span className="stat-label">Time</span>
        <span className="timer-display">
          <strong
            id="timer-value"
            className={`stat-value${urgent ? " stat-value--urgent" : ""}`}
          >
            {formatTime(remainingMs)}
          </strong>
          {timeBonus !== null && (
            <span
              key={timeBonus.key}
              className="timer-bonus"
              aria-hidden="true"
            >
              + {bonusSeconds}
            </span>
          )}
        </span>
        <span className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcementChannel === 0 ? bonusAnnouncement : ""}
        </span>
        <span className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcementChannel === 1 ? bonusAnnouncement : ""}
        </span>
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
