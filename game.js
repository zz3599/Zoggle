import { BOARDS, ROUND_SECONDS } from "./src/config.js";
import { loadDictionary } from "./src/dictionary.js";
import { GameState } from "./src/game-state.js";
import { isEligibleWord, scoreWord, wordFromPath } from "./src/rules.js";
import { SelectionController } from "./src/selection.js";
import { GameView } from "./src/ui.js";

const view = new GameView();

let boardIndex = 0;
let dictionary = null;
let gameState = null;
let timerId = null;
let expirationAnnounced = false;

function currentBoard() {
  return BOARDS[boardIndex];
}

function validateWord(word, _cells, snapshot) {
  if (isEligibleWord(word, dictionary, snapshot.foundWords)) {
    return true;
  }

  if (word.length < 3) {
    return { valid: false, reason: "too-short" };
  }

  if (!/^[a-z]+$/.test(word)) {
    return { valid: false, reason: "unsupported-word" };
  }

  if (!dictionary.has(word)) {
    return { valid: false, reason: "not-in-dictionary" };
  }

  return { valid: false, reason: "duplicate" };
}

function wordForPath(path) {
  if (path.length === 0) return "";

  try {
    return wordFromPath(currentBoard().letters, path);
  } catch {
    return "";
  }
}

const selection = new SelectionController(view.boardElement, {
  isEnabled: () =>
    dictionary !== null && gameState !== null && !gameState.isExpired(),
  onPathChange(path) {
    view.renderSelection(wordForPath(path), path);
  },
  onSubmit(path) {
    submitPath(path);
  },
});

function submissionMessage(result) {
  if (result.accepted) {
    const suffix = result.points === 1 ? "point" : "points";
    return {
      text: `${result.word.toUpperCase()} · +${result.points} ${suffix}`,
      tone: "success",
    };
  }

  const messages = {
    duplicate: "You already found that word.",
    expired: "Time’s up — start another round to keep playing.",
    "invalid-cells": "That path cannot be used.",
    "invalid-word": "That is not a playable word.",
    "not-in-dictionary": "That word is not in the dictionary.",
    "too-short": "Words need at least three letters.",
    "unsupported-word": "Only lowercase, unhyphenated dictionary words count.",
  };

  return {
    text: messages[result.reason] ?? "That word cannot be scored.",
    tone: "error",
  };
}

function submitPath(path) {
  if (!gameState) return;

  const word = wordForPath(path);
  if (!word) {
    view.setStatus("That path cannot be used.", "error");
    return;
  }

  const result = gameState.submitWord({ word, cells: path });
  view.renderRound(result.state);

  if (result.state.expired) {
    finishRound(result.state);
    return;
  }

  const message = submissionMessage(result);
  view.setStatus(message.text, message.tone);
}

function finishRound(snapshot = gameState?.getSnapshot()) {
  if (!snapshot) return;

  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }

  selection.cancel();
  view.renderRound(snapshot);

  if (!expirationAnnounced) {
    expirationAnnounced = true;
    const suffix = snapshot.score === 1 ? "point" : "points";
    view.setStatus(`Round complete — ${snapshot.score} ${suffix}.`, "neutral");
  }
}

function updateTimer() {
  if (!gameState) return;

  const snapshot = gameState.getSnapshot();
  view.renderRound(snapshot);

  if (snapshot.expired) finishRound(snapshot);
}

function startRound(nextBoardIndex = boardIndex) {
  boardIndex = nextBoardIndex;
  expirationAnnounced = false;
  selection.cancel();
  view.renderBoard(currentBoard());

  if (gameState) {
    gameState.resetRound({
      boardId: currentBoard().id,
      durationMs: ROUND_SECONDS * 1000,
    });
  } else {
    gameState = new GameState({
      boardId: currentBoard().id,
      durationMs: ROUND_SECONDS * 1000,
      validateWord,
      scoreWord,
    });
  }

  view.clearSelection();
  view.renderRound(gameState.getSnapshot());
  view.showReady();

  if (timerId !== null) window.clearInterval(timerId);
  timerId = window.setInterval(updateTimer, 100);
}

async function loadAndStart() {
  dictionary = null;
  gameState = null;
  selection.cancel();

  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }

  view.showLoading();

  try {
    dictionary = await loadDictionary();
    startRound(boardIndex);
  } catch (error) {
    console.error("Unable to load the Zoggle dictionary", error);
    view.showLoadError();
  }
}

view.onRestart(() => startRound(boardIndex));
view.onNewBoard(() => startRound((boardIndex + 1) % BOARDS.length));
view.onRetry(loadAndStart);

view.renderBoard(currentBoard());
loadAndStart();
