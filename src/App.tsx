import { Board } from "./components/Board";
import { FoundWords } from "./components/FoundWords";
import { RoundActions } from "./components/RoundActions";
import { Stats } from "./components/Stats";
import { BOARDS } from "./config";
import { loadDictionary } from "./dictionary";
import {
  useDictionary,
  type DictionaryLoader,
} from "./hooks/use-dictionary";
import {
  useGame,
  type GameController,
  type StatusMessage,
} from "./hooks/use-game";
import type { Coordinate } from "./types";

interface AppProps {
  readonly dictionaryLoader?: DictionaryLoader;
}

const LOADING_STATUS: StatusMessage = {
  text: "Loading dictionary…",
  tone: "neutral",
};

const LOAD_ERROR_STATUS: StatusMessage = {
  text: "The dictionary could not be loaded. Check the server and try again.",
  tone: "error",
};

const EMPTY_PATH: readonly Coordinate[] = [];
const EMPTY_USED_CELLS = new Set<string>();
const selectionDisabled = () => false;
const ignorePath: (path: readonly Coordinate[]) => void = () => {};

interface GameScreenProps {
  readonly game?: GameController;
  readonly status: StatusMessage;
  readonly onRetry?: () => void;
}

function GameScreen({ game, status, onRetry }: GameScreenProps) {
  const board = game?.board ?? BOARDS[0]!;
  const snapshot = game?.snapshot ?? null;

  return (
    <main id="game" className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">A quick word hunt</p>
          <h1>Zoggle</h1>
        </div>
      </header>

      <Stats snapshot={snapshot} />

      <div className="game-layout">
        <section className="board-panel" aria-labelledby="board-name">
          <div className="board-heading">
            <h2 id="board-name">{board.id} board</h2>
            <div className="board-feedback">
              {game?.currentWord && (
                <output id="current-word" aria-label="Current word">
                  {game.currentWord.toUpperCase()}
                </output>
              )}
              <p
                id="status"
                role="status"
                aria-live="polite"
                data-tone={status.tone}
              >
                {status.text}
              </p>
            </div>
          </div>

          <Board
            board={board}
            enabled={game?.enabled ?? false}
            isEnabled={game?.isSelectionEnabled ?? selectionDisabled}
            path={game?.path ?? EMPTY_PATH}
            resetKey={game?.roundKey ?? 0}
            usedCells={game?.usedCells ?? EMPTY_USED_CELLS}
            onPathChange={game?.onPathChange ?? ignorePath}
            onSubmit={game?.onSubmit ?? ignorePath}
          />

          {onRetry && (
            <button
              id="retry-load"
              className="secondary-button"
              type="button"
              onClick={onRetry}
            >
              Retry dictionary
            </button>
          )}

          {snapshot && game && (
            <RoundActions
              expired={snapshot.expired}
              onPlayAgain={game.playAgain}
              onPlayNextBoard={game.playNextBoard}
            />
          )}
        </section>

        <FoundWords words={snapshot?.foundWords ?? []} />
      </div>
    </main>
  );
}

function ReadyGame({ dictionary }: { readonly dictionary: ReadonlySet<string> }) {
  const game = useGame(dictionary);
  return <GameScreen game={game} status={game.status} />;
}

export function App({ dictionaryLoader = loadDictionary }: AppProps) {
  const dictionaryState = useDictionary(dictionaryLoader);

  if (dictionaryState.status === "ready") {
    return <ReadyGame dictionary={dictionaryState.dictionary} />;
  }

  return (
    <GameScreen
      status={
        dictionaryState.status === "error"
          ? LOAD_ERROR_STATUS
          : LOADING_STATUS
      }
      onRetry={
        dictionaryState.status === "error" ? dictionaryState.retry : undefined
      }
    />
  );
}
