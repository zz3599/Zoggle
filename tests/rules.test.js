import assert from "node:assert/strict";
import { test } from "vitest";

import {
  areAdjacent,
  isEligibleWord,
  isInBounds,
  isValidPath,
  scoreWord,
  wordFromPath,
} from "../src/rules.js";

const board = [
  ["C", "A", "T"],
  ["R", "E", "S"],
  ["D", "O", "G"],
];

test("areAdjacent accepts all eight neighboring directions", () => {
  const center = { row: 1, col: 1 };
  const neighbors = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 1, col: 0 },
    { row: 1, col: 2 },
    { row: 2, col: 0 },
    { row: 2, col: 1 },
    { row: 2, col: 2 },
  ];

  for (const neighbor of neighbors) {
    assert.equal(areAdjacent(center, neighbor), true);
  }
});

test("areAdjacent rejects the same cell and non-neighbors", () => {
  assert.equal(areAdjacent({ row: 1, col: 1 }, { row: 1, col: 1 }), false);
  assert.equal(areAdjacent({ row: 0, col: 0 }, { row: 0, col: 2 }), false);
  assert.equal(areAdjacent({ row: 0, col: 0 }, { row: 2, col: 2 }), false);
});

test("isInBounds recognizes valid and invalid board coordinates", () => {
  assert.equal(isInBounds(board, { row: 0, col: 0 }), true);
  assert.equal(isInBounds(board, { row: 2, col: 2 }), true);
  assert.equal(isInBounds(board, { row: -1, col: 0 }), false);
  assert.equal(isInBounds(board, { row: 3, col: 0 }), false);
  assert.equal(isInBounds(board, { row: 0, col: 3 }), false);
  assert.equal(isInBounds(board, { row: 0.5, col: 0 }), false);
});

test("isValidPath accepts adjacent cells, including diagonals", () => {
  assert.equal(
    isValidPath(board, [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 0, col: 2 },
    ]),
    true,
  );
});

test("isValidPath rejects empty, out-of-bounds, jumping, and reused paths", () => {
  assert.equal(isValidPath(board, []), false);
  assert.equal(isValidPath(board, [{ row: 3, col: 0 }]), false);
  assert.equal(
    isValidPath(board, [
      { row: 0, col: 0 },
      { row: 0, col: 2 },
    ]),
    false,
  );
  assert.equal(
    isValidPath(board, [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 0, col: 0 },
    ]),
    false,
  );
});

test("wordFromPath builds a lowercase word from a valid path", () => {
  const path = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ];

  assert.equal(wordFromPath(board, path), "cat");
});

test("wordFromPath rejects an invalid path", () => {
  assert.throws(
    () =>
      wordFromPath(board, [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
      ]),
    RangeError,
  );
});

test("isEligibleWord accepts a new lowercase dictionary word of length 3+", () => {
  assert.equal(
    isEligibleWord("cat", new Set(["cat", "cater"]), new Set(["cater"])),
    true,
  );
});

test("isEligibleWord rejects short, capitalized, hyphenated, absent, and duplicate words", () => {
  const dictionary = new Set(["at", "cat", "Cat", "cat-like", "dog"]);

  assert.equal(isEligibleWord("at", dictionary), false);
  assert.equal(isEligibleWord("Cat", dictionary), false);
  assert.equal(isEligibleWord("cat-like", dictionary), false);
  assert.equal(isEligibleWord("rat", dictionary), false);
  assert.equal(isEligibleWord("cat", dictionary, new Set(["cat"])), false);
});

test("isEligibleWord supports dictionary objects and submitted-word arrays", () => {
  const dictionary = { cat: "a feline", dog: "a canine" };

  assert.equal(isEligibleWord("cat", dictionary, []), true);
  assert.equal(isEligibleWord("cat", dictionary, ["cat"]), false);
});

test("scoreWord implements every scoring boundary exactly", () => {
  const expectations = new Map([
    ["", 0],
    ["aa", 0],
    ["aaa", 1],
    ["aaaa", 1],
    ["aaaaa", 2],
    ["aaaaaa", 3],
    ["aaaaaaa", 4],
    ["aaaaaaaa", 11],
    ["aaaaaaaaa", 20],
    ["aaaaaaaaaaaa", 20],
  ]);

  for (const [word, score] of expectations) {
    assert.equal(scoreWord(word), score, `expected ${word.length} letters to score ${score}`);
  }
});
