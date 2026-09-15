import assert from "node:assert/strict";
import { test } from "vitest";

import { applyBoardGravity } from "../src/endless-board";
import type { BoardDefinition } from "../src/types";

const BOARD: BoardDefinition = {
  id: "fixture",
  label: "Fixture board",
  letters: [
    [..."CAT"],
    [..."DOG"],
    [..."HEN"],
  ],
};

test("settles affected columns downward and reports spawned and moved destinations", () => {
  const board: BoardDefinition = {
    id: "gravity-fixture",
    label: "Gravity fixture",
    letters: [
      [..."ABC"],
      [..."DEF"],
      [..."GHI"],
      [..."JKL"],
    ],
  };
  const randomValues = [0, 0.5, 0.99];

  const result = applyBoardGravity(
    board,
    [
      { row: 3, col: 0 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
    ],
    {
      letterPool: "XYZ",
      random: () => randomValues.shift() ?? 0,
    },
  );

  assert.deepEqual(result.board, {
    ...board,
    letters: [
      [..."XBZ"],
      [..."YEF"],
      [..."AHI"],
      [..."GKL"],
    ],
  });
  assert.deepEqual(result.falls, [
    {
      destination: { row: 0, col: 0 },
      sourceRow: null,
      fallRows: 2,
      spawned: true,
    },
    {
      destination: { row: 0, col: 2 },
      sourceRow: null,
      fallRows: 1,
      spawned: true,
    },
    {
      destination: { row: 1, col: 0 },
      sourceRow: null,
      fallRows: 2,
      spawned: true,
    },
    {
      destination: { row: 2, col: 0 },
      sourceRow: 0,
      fallRows: 2,
      spawned: false,
    },
    {
      destination: { row: 3, col: 0 },
      sourceRow: 2,
      fallRows: 1,
      spawned: false,
    },
  ]);
  assert.deepEqual(result.frontier, result.falls.map(({ destination }) => destination));
  assert.deepEqual(board.letters, [
    [..."ABC"],
    [..."DEF"],
    [..."GHI"],
    [..."JKL"],
  ]);
});

test("deduplicates removed cells and samples each spawn once in stable column order", () => {
  const randomValues = [0, 0.5];
  let randomCalls = 0;
  const random = () => {
    randomCalls += 1;
    return randomValues.shift() ?? 0;
  };

  const result = applyBoardGravity(
    BOARD,
    [
      { row: 1, col: 2 },
      { row: 2, col: 0 },
      { row: 1, col: 2 },
    ],
    { letterPool: "AABC", random },
  );

  assert.deepEqual(result.board.letters, [
    [..."AAB"],
    [..."COT"],
    [..."DEN"],
  ]);
  assert.deepEqual(result.frontier, [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
    { row: 1, col: 0 },
    { row: 1, col: 2 },
    { row: 2, col: 0 },
  ]);
  assert.equal(randomCalls, 2);
});

test("returns an unchanged board and no gravity metadata for an empty removal", () => {
  const result = applyBoardGravity(BOARD, [], {
    letterPool: "",
    random: () => 1,
  });

  assert.equal(result.board, BOARD);
  assert.deepEqual(result.falls, []);
  assert.deepEqual(result.frontier, []);
});

test("validates gravity inputs before consuming randomness", () => {
  let randomCalls = 0;
  const random = () => {
    randomCalls += 1;
    return 0;
  };

  assert.throws(
    () => applyBoardGravity(BOARD, [{ row: 3, col: 0 }], { random }),
    /outside the board/,
  );
  assert.equal(randomCalls, 0);
  assert.throws(
    () => applyBoardGravity(BOARD, [{ row: 0, col: 0 }], {
      letterPool: ["AA"],
      random,
    }),
    /single ASCII letters/,
  );
  assert.equal(randomCalls, 0);
  assert.throws(
    () => applyBoardGravity(BOARD, [{ row: 0, col: 0 }], { random: () => 1 }),
    /\[0, 1\)/,
  );
});
