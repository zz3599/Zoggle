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
import type { BoardDefinition, Coordinate } from "./types";

interface AppProps {
  readonly dictionaryLoader?: DictionaryLoader;
  readonly boards?: readonly BoardDefinition[];
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

function boardCollectionKey(boards: readonly BoardDefinition[]): string {
  return JSON.stringify(
    boards.map(({ id, letters }) => [
      id,
      letters.map((row) => row.join("")),
    ]),
  );
}

interface GameScreenProps {
  readonly fallbackBoard: BoardDefinition;
  readonly game?: GameController;
  readonly status: StatusMessage;
  readonly onRetry?: () => void;
}

function GameScreen({ fallbackBoard, game, status, onRetry }: GameScreenProps) {
  const board = game?.board ?? fallbackBoard;
  const boardLabel = board.label ?? `${board.id} board`;
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
            <h2 id="board-name">{boardLabel}</h2>
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

interface ReadyGameProps {
  readonly boards: readonly BoardDefinition[];
  readonly dictionary: ReadonlySet<string>;
}

function ReadyGame({ boards, dictionary }: ReadyGameProps) {
  const game = useGame(dictionary, boards);
  return (
    <GameScreen fallbackBoard={boards[0]!} game={game} status={game.status} />
  );
}

export function App({ dictionaryLoader = loadDictionary, boards = BOARDS }: AppProps) {
  const fallbackBoard = boards[0];
  if (!fallbackBoard) throw new RangeError("At least one board is required");

  const dictionaryState = useDictionary(dictionaryLoader);

  if (dictionaryState.status === "ready") {
    return (
      <ReadyGame
        key={boardCollectionKey(boards)}
        boards={boards}
        dictionary={dictionaryState.dictionary}
      />
    );
  }

  return (
    <GameScreen
      fallbackBoard={fallbackBoard}
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
