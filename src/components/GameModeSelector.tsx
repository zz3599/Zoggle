import type { GameMode } from "../types";

interface GameModeSelectorProps {
  readonly mode: GameMode;
  readonly onChange: (mode: GameMode) => void;
}

const MODE_OPTIONS = [
  {
    description: "Use each tile once",
    label: "Classic",
    value: "classic",
  },
  {
    description: "Gravity and word cascades",
    label: "Endless",
    value: "endless",
  },
] as const;

export function GameModeSelector({ mode, onChange }: GameModeSelectorProps) {
  return (
    <section className="mode-selector" aria-labelledby="game-mode-label">
      <p id="game-mode-label" className="mode-selector__label">
        Game mode
      </p>
      <div
        className="mode-selector__options"
        role="group"
        aria-labelledby="game-mode-label"
      >
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className="mode-option"
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="mode-option__name">{option.label}</span>
            <span className="mode-option__description">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
