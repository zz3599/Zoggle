import assert from "node:assert/strict";
import { test } from "vitest";

import { replenishBoard } from "../src/endless-board";
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

test("replenishes only submitted tiles without mutating the original board", () => {
  const randomValues = [0, 0.5, 0.99];
  const refreshed = replenishBoard(
    BOARD,
    [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
    {
      letterPool: "ABCDE",
      random: () => randomValues.shift() ?? 0,
    },
  );

  assert.deepEqual(refreshed, {
    ...BOARD,
    letters: [
      [..."ADE"],
      [..."DOG"],
      [..."HEN"],
    ],
  });
  assert.deepEqual(BOARD.letters[0], [..."CAT"]);
  assert.equal(refreshed.id, BOARD.id);
  assert.equal(refreshed.label, BOARD.label);
});

test("prefers a different letter at every replenished position", () => {
  const refreshed = replenishBoard(
    BOARD,
    [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
    { letterPool: "CAT", random: () => 0 },
  );

  assert.deepEqual(refreshed.letters[0], ["A", "C", "C"]);
});

test("retains a letter when the configured pool has no alternative", () => {
  const refreshed = replenishBoard(
    BOARD,
    [{ row: 0, col: 0 }],
    { letterPool: "C", random: () => 0 },
  );

  assert.equal(refreshed.letters[0]?.[0], "C");
});

test("returns the existing board when no cells need replenishing", () => {
  assert.equal(replenishBoard(BOARD, []), BOARD);
});

test("rejects invalid cells, pools, and random values", () => {
  assert.throws(
    () => replenishBoard(BOARD, [{ row: 3, col: 0 }]),
    /outside the board/,
  );
  assert.throws(
    () => replenishBoard(BOARD, [{ row: 0, col: 0 }], { letterPool: "" }),
    /must not be empty/,
  );
  assert.throws(
    () =>
      replenishBoard(BOARD, [{ row: 0, col: 0 }], {
        random: () => 1,
      }),
    /\[0, 1\)/,
  );
});
