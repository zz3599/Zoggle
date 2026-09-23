import { useCallback, useEffect, useRef, useState } from "react";

import { Board } from "./components/Board";
import { FoundWords } from "./components/FoundWords";
import { GameModeSelector } from "./components/GameModeSelector";
import {
  RoundActions,
  type FreshBoardStatus,
} from "./components/RoundActions";
import { Stats } from "./components/Stats";
import { BOARDS } from "./config";
import { loadDictionary } from "./dictionary";
import {
  generateFreshBoard,
  type FreshBoardGenerator,
} from "./fresh-board";
import type { RandomSource } from "./endless-board";
import {
  useDictionary,
  type DictionaryLoader,
} from "./hooks/use-dictionary";
import {
  useGame,
  type GameController,
  type StatusMessage,
} from "./hooks/use-game";
import type { BoardDefinition, Coordinate, GameMode } from "./types";

interface AppProps {
  readonly dictionaryLoader?: DictionaryLoader;
  readonly boards?: readonly BoardDefinition[];
  readonly freshBoardGenerator?: FreshBoardGenerator;
  readonly endlessTileRandom?: RandomSource;
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
const ignoreAction = () => {};
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
  readonly freshBoardStatus?: FreshBoardStatus;
  readonly game?: GameController;
  readonly onGenerateFreshBoard?: () => void;
  readonly onPlayAgain?: () => void;
  readonly onPlayNextBoard?: () => void;
  readonly status: StatusMessage;
  readonly onRetry?: () => void;
}

function GameScreen({
  fallbackBoard,
  freshBoardStatus = "idle",
  game,
  onGenerateFreshBoard,
  onPlayAgain,
  onPlayNextBoard,
  status,
  onRetry,
}: GameScreenProps) {
  const board = game?.board ?? fallbackBoard;
  const boardLabel = board.label ?? `${board.id} board`;
  const snapshot = game?.snapshot ?? null;

  return (
    <>
      <Stats snapshot={snapshot} timeBonus={game?.timeBonus ?? null} />

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
            cascadeCells={game?.cascadeCells ?? EMPTY_USED_CELLS}
            enabled={game?.enabled ?? false}
            gravityFalls={game?.gravityFalls ?? []}
            gravityKey={game?.gravityKey ?? 0}
            isEnabled={game?.isSelectionEnabled ?? selectionDisabled}
            path={game?.path ?? EMPTY_PATH}
            resetKey={game?.roundKey ?? 0}
            resolving={game?.resolving ?? false}
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
              freshBoardStatus={freshBoardStatus}
              onGenerateFreshBoard={onGenerateFreshBoard ?? ignoreAction}
              onPlayAgain={onPlayAgain ?? game.playAgain}
              onPlayNextBoard={onPlayNextBoard ?? game.playNextBoard}
            />
          )}
        </section>

        <FoundWords words={snapshot?.foundWords ?? []} />
      </div>
    </>
  );
}

interface ReadyGameProps {
  readonly boards: readonly BoardDefinition[];
  readonly dictionary: ReadonlySet<string>;
  readonly freshBoardGenerator: FreshBoardGenerator;
  readonly endlessTileRandom: RandomSource;
  readonly mode: GameMode;
}

function ReadyGame({
  boards,
  dictionary,
  freshBoardGenerator,
  endlessTileRandom,
  mode,
}: ReadyGameProps) {
  const game = useGame(dictionary, boards, mode, endlessTileRandom);
  const { playAgain, playBoard, playNextBoard } = game;
  const [freshBoardStatus, setFreshBoardStatus] =
    useState<FreshBoardStatus>("idle");
  const generationRef = useRef<AbortController | null>(null);
  const seenBoardIdsRef = useRef(new Set(boards.map(({ id }) => id)));

  useEffect(() => {
    return () => {
      const generation = generationRef.current;
      generationRef.current = null;
      generation?.abort();
    };
  }, []);

  const handleGenerateFreshBoard = useCallback(() => {
    if (generationRef.current !== null) {
      const generation = generationRef.current;
      generationRef.current = null;
      generation.abort();
      setFreshBoardStatus("cancelled");
      return;
    }

    const generation = new AbortController();
    generationRef.current = generation;
    setFreshBoardStatus("generating");

    void Promise.resolve()
      .then(() =>
        freshBoardGenerator(dictionary, {
          excludedBoardIds: [...seenBoardIdsRef.current],
          signal: generation.signal,
        }),
      )
      .then(
        (board) => {
          if (generationRef.current !== generation) return;
          generationRef.current = null;
          seenBoardIdsRef.current.add(board.id);
          playBoard(board);
          setFreshBoardStatus("success");
        },
        () => {
          if (generationRef.current !== generation) return;
          generationRef.current = null;
          setFreshBoardStatus("error");
        },
      );
  }, [dictionary, freshBoardGenerator, playBoard]);

  const handlePlayAgain = useCallback(() => {
    setFreshBoardStatus("idle");
    playAgain();
  }, [playAgain]);
  const handlePlayNextBoard = useCallback(() => {
    setFreshBoardStatus("idle");
    playNextBoard();
  }, [playNextBoard]);

  return (
    <GameScreen
      fallbackBoard={boards[0]!}
      freshBoardStatus={freshBoardStatus}
      game={game}
      onGenerateFreshBoard={handleGenerateFreshBoard}
      onPlayAgain={handlePlayAgain}
      onPlayNextBoard={handlePlayNextBoard}
      status={game.status}
    />
  );
}

export function App({
  dictionaryLoader = loadDictionary,
  boards = BOARDS,
  freshBoardGenerator = generateFreshBoard,
  endlessTileRandom = Math.random,
}: AppProps) {
  const fallbackBoard = boards[0];
  if (!fallbackBoard) throw new RangeError("At least one board is required");

  const dictionaryState = useDictionary(dictionaryLoader);
  const [mode, setMode] = useState<GameMode>("classic");

  const gameScreen = dictionaryState.status === "ready"
    ? (
      <ReadyGame
        key={`${boardCollectionKey(boards)}:${mode}`}
        boards={boards}
        dictionary={dictionaryState.dictionary}
        endlessTileRandom={endlessTileRandom}
        freshBoardGenerator={freshBoardGenerator}
        mode={mode}
      />
    )
    : (
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

  return (
    <main id="game" className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">A quick word hunt</p>
          <h1>Zoggle</h1>
        </div>
        <GameModeSelector mode={mode} onChange={setMode} />
      </header>
      {gameScreen}
    </main>
  );
}
