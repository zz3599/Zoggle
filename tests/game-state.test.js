import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ROUND_DURATION_MS,
  GameState,
  createGameState,
  highScoreStorageKey,
  scoreForWord,
} from "../src/game-state.js";

function memoryStorage(initialEntries = []) {
  const entries = new Map(initialEntries);
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    entries,
  };
}

test("scores every documented word-length boundary", () => {
  assert.equal(scoreForWord("no"), 0);
  assert.equal(scoreForWord("cat"), 1);
  assert.equal(scoreForWord("four"), 1);
  assert.equal(scoreForWord("fives"), 2);
  assert.equal(scoreForWord("sixes!"), 3);
  assert.equal(scoreForWord("seventh"), 4);
  assert.equal(scoreForWord("eight888"), 11);
  assert.equal(scoreForWord("ninechars"), 20);
  assert.equal(scoreForWord("any longer word"), 20);
});

test("starts a configurable round and expires exactly at its deadline", () => {
  let currentTime = 1_000;
  const game = createGameState({
    boardId: "board-1",
    durationMs: 2_000,
    storage: null,
    now: () => currentTime,
  });

  assert.deepEqual(game.getSnapshot(), {
    boardId: "board-1",
    durationMs: 2_000,
    startedAt: 1_000,
    endsAt: 3_000,
    remainingMs: 2_000,
    expired: false,
    status: "active",
    score: 0,
    highScore: 0,
    foundWords: [],
    usedCells: [],
  });

  currentTime = 2_999;
  assert.equal(game.getRemainingMs(), 1);
  assert.equal(game.isExpired(), false);

  currentTime = 3_000;
  assert.equal(game.getRemainingMs(), 0);
  assert.equal(game.isExpired(), true);
  assert.equal(game.getSnapshot().status, "expired");
});

test("accepts validated words, rejects invalid and duplicate words, and tracks used cells", () => {
  const validated = [];
  const game = new GameState({
    boardId: "board-1",
    storage: null,
    now: () => 10,
    validateWord(word, cells, snapshot) {
      validated.push({ word, cells, score: snapshot.score });
      return word === "cat" || { valid: false, reason: "not-in-dictionary" };
    },
    scoreWord(word) {
      return word.length;
    },
  });

  const invalid = game.submitWord({ word: "dog", cells: [[0, 0]] });
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.reason, "not-in-dictionary");
  assert.equal(invalid.state.score, 0);

  const accepted = game.submitWord({
    word: " CAT ",
    cells: [[0, 0], { row: 0, col: 1 }, "0,2"],
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.word, "cat");
  assert.equal(accepted.points, 3);
  assert.equal(accepted.state.score, 3);
  assert.equal(accepted.state.highScore, 3);
  assert.deepEqual(accepted.state.foundWords, ["cat"]);
  assert.deepEqual(accepted.state.usedCells, ["0,0", "0,1", "0,2"]);
  assert.equal(game.isCellUsed({ row: 0, col: 1 }), true);
  assert.equal(game.isCellUsed([1, 1]), false);

  const duplicate = game.submitWord({ word: "Cat", cells: [[1, 0]] });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate");
  assert.equal(duplicate.state.score, 3);
  assert.deepEqual(duplicate.state.usedCells, ["0,0", "0,1", "0,2"]);
  assert.equal(validated.length, 2, "duplicates do not run validation again");
});

test("supports explicit validation and points supplied by browser orchestration", () => {
  const game = new GameState({ boardId: "board-1", storage: null, now: () => 0 });

  const rejected = game.submitWord({ word: "cat", cells: [], valid: false, points: 99 });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "invalid-word");

  const accepted = game.submitWord({
    word: "planet",
    cells: ["0,0", "0,1"],
    valid: true,
    points: 7,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.points, 7);
  assert.equal(accepted.state.score, 7);

  const invalidScore = game.submitWord({ word: "star", valid: true, points: -1 });
  assert.equal(invalidScore.accepted, false);
  assert.equal(invalidScore.reason, "invalid-score");
  assert.deepEqual(invalidScore.state.foundWords, ["planet"]);
});

test("rejects post-expiry submissions without invoking rules or changing state", () => {
  let currentTime = 100;
  let validations = 0;
  const game = new GameState({
    boardId: "board-1",
    durationMs: 50,
    storage: null,
    now: () => currentTime,
    validateWord() {
      validations += 1;
      return true;
    },
  });

  currentTime = 150;
  const result = game.submitWord({ word: "cat", cells: [[0, 0]] });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "expired");
  assert.equal(result.state.expired, true);
  assert.equal(result.state.score, 0);
  assert.deepEqual(result.state.foundWords, []);
  assert.equal(validations, 0);
});

test("resets the same or a new board while retaining separate high scores", () => {
  let currentTime = 1_000;
  const storage = memoryStorage();
  const game = new GameState({
    boardId: "board/a",
    durationMs: 10_000,
    storage,
    now: () => currentTime,
  });

  game.submitWord({ word: "alpha", valid: true, points: 5, cells: [[0, 0]] });
  currentTime = 2_000;
  const replay = game.resetRound();
  assert.equal(replay.boardId, "board/a");
  assert.equal(replay.startedAt, 2_000);
  assert.equal(replay.score, 0);
  assert.equal(replay.highScore, 5);
  assert.deepEqual(replay.foundWords, []);
  assert.deepEqual(replay.usedCells, []);

  const differentBoard = game.resetRound({ boardId: "board/b", durationMs: 500 });
  assert.equal(differentBoard.boardId, "board/b");
  assert.equal(differentBoard.durationMs, 500);
  assert.equal(differentBoard.highScore, 0);
  game.submitWord({ word: "beta", valid: true, points: 2 });

  const originalBoard = game.startRound({ boardId: "board/a" });
  assert.equal(originalBoard.durationMs, 500, "duration carries forward when omitted");
  assert.equal(originalBoard.highScore, 5);
});

test("persists high scores per board and ignores corrupt stored values", () => {
  const storage = memoryStorage();
  const firstGame = new GameState({ boardId: "board 1", storage, now: () => 0 });
  firstGame.submitWord({ word: "alpha", valid: true, points: 8 });

  assert.equal(
    storage.entries.get(highScoreStorageKey("board 1")),
    "8",
  );
  assert.equal(new GameState({ boardId: "board 1", storage, now: () => 0 }).getSnapshot().highScore, 8);
  assert.equal(new GameState({ boardId: "board 2", storage, now: () => 0 }).getSnapshot().highScore, 0);

  storage.entries.set(highScoreStorageKey("broken"), "definitely-not-a-score");
  assert.equal(new GameState({ boardId: "broken", storage, now: () => 0 }).getSnapshot().highScore, 0);
});

test("continues with in-memory high scores when storage throws", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  const game = new GameState({
    boardId: "board-1",
    storage: unavailableStorage,
    now: () => 0,
  });

  const accepted = game.submitWord({ word: "cat", valid: true });
  assert.equal(accepted.state.highScore, 1);
  assert.equal(game.resetRound().highScore, 1);
});

test("uses the documented defaults and validates constructor configuration", () => {
  const game = new GameState({ boardId: "board-1", storage: null, now: () => 0 });
  assert.equal(game.getSnapshot().durationMs, DEFAULT_ROUND_DURATION_MS);

  assert.throws(() => new GameState({ boardId: "", storage: null }), /boardId/);
  assert.throws(
    () => new GameState({ boardId: "board-1", durationMs: 0, storage: null }),
    /durationMs/,
  );
});
