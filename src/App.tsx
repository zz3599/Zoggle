import { Board } from "./components/Board";
import { FoundWords } from "./components/FoundWords";
import { RoundActions } from "./components/RoundActions";
import { Stats } from "./components/Stats";
import { loadDictionary } from "./dictionary";
import {
  useDictionary,
  type DictionaryLoader,
} from "./hooks/use-dictionary";
import { useGame, type StatusMessage } from "./hooks/use-game";

interface AppProps {
  readonly dictionaryLoader?: DictionaryLoader;
}

const LOADING_STATUS: StatusMessage = {
  text: "Loading Webster’s dictionary…",
  tone: "neutral",
};

const LOAD_ERROR_STATUS: StatusMessage = {
  text: "The dictionary could not be loaded. Check the server and try again.",
  tone: "error",
};

export function App({ dictionaryLoader = loadDictionary }: AppProps) {
  const dictionaryState = useDictionary(dictionaryLoader);
  const game = useGame(dictionaryState.dictionary);
  const loading = dictionaryState.status === "loading";
  const loadFailed = dictionaryState.status === "error";
  const status = loadFailed
    ? LOAD_ERROR_STATUS
    : loading || game.snapshot === null
      ? LOADING_STATUS
      : game.status;
  const enabled = dictionaryState.status === "ready" && game.enabled;

  return (
    <main id="game" className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">A quick word hunt</p>
          <h1>Zoggle</h1>
        </div>
        <p className="instructions">
          Hold, trace neighboring letters, then release. Each tile can be used
          once per round.
        </p>
      </header>

      <Stats snapshot={game.snapshot} />

      <div className="game-layout">
        <section className="board-panel" aria-labelledby="board-name">
          <div className="board-heading">
            <h2 id="board-name">{game.board.id} board</h2>
            <p id="status" role="status" aria-live="polite" data-tone={status.tone}>
              {status.text}
            </p>
          </div>

          <Board
            board={game.board}
            enabled={enabled}
            path={game.path}
            resetKey={game.roundKey}
            usedCells={game.usedCells}
            onPathChange={game.onPathChange}
            onSubmit={game.onSubmit}
          />

          <div className="word-preview" aria-live="polite">
            <span>Current word</span>
            <output id="current-word">
              {game.currentWord ? game.currentWord.toUpperCase() : "—"}
            </output>
          </div>

          {loadFailed && (
            <button
              id="retry-load"
              className="secondary-button"
              type="button"
              onClick={dictionaryState.retry}
            >
              Retry dictionary
            </button>
          )}

          {game.snapshot && (
            <RoundActions
              expired={game.snapshot.expired}
              onPlayAgain={game.playAgain}
              onPlayNextBoard={game.playNextBoard}
            />
          )}
        </section>

        <FoundWords words={game.snapshot?.foundWords ?? []} />
      </div>
    </main>
  );
}
