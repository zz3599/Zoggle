import assert from "node:assert/strict";
import { test } from "vitest";

import {
  DEFAULT_LETTER_POOL,
  analyzeBoard,
  buildWordTrie,
  createBoardId,
  generateBoard,
  measureBoard,
  solveBoard,
} from "../src/board-generation";

test("solveBoard finds orthogonal and diagonal words and reconstructs their paths", () => {
  const words = solveBoard(
    ["DOT", "XOX", "XXG"],
    buildWordTrie(["dot", "dog"]),
  );

  assert.deepEqual(words, [
    {
      word: "dog",
      path: [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 2 },
      ],
      pathMask: 273n,
    },
    {
      word: "dot",
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      pathMask: 7n,
    },
  ]);
});

test("solveBoard follows terminal prefixes without reusing a cell", () => {
  const prefixTrie = buildWordTrie(["cat", "cater", "cat"]);

  assert.equal(prefixTrie.wordCount, 2);
  assert.equal(prefixTrie.maxWordLength, 5);
  assert.deepEqual(solveBoard(["CATER"], prefixTrie), [
    {
      word: "cat",
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      pathMask: 7n,
    },
    {
      word: "cater",
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 0, col: 3 },
        { row: 0, col: 4 },
      ],
      pathMask: 31n,
    },
  ]);

  const reuseTrie = buildWordTrie(["aba", "abab"]);
  assert.deepEqual(
    solveBoard(["ABA"], reuseTrie).map(({ word }) => word),
    ["aba"],
  );
});

test("solveBoard deduplicates words and retains the first row-major DFS path", () => {
  const words = solveBoard(["AA", "AA"], buildWordTrie(["aaa"]));

  assert.deepEqual(words, [
    {
      word: "aaa",
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
      pathMask: 7n,
    },
  ]);
});

test("analyzeBoard computes score, length, coverage, and disjoint-word metrics", () => {
  const board = ["ABCDEFGH"];
  const trie = buildWordTrie(["abc", "def", "abcdefgh"]);
  const analysis = analyzeBoard(board, trie);

  assert.deepEqual(
    analysis.words.map(({ word }) => word),
    ["abc", "abcdefgh", "def"],
  );
  assert.deepEqual(analysis.metrics, {
    wordCount: 3,
    potentialScore: 13,
    longestWordLength: 8,
    longWordCount: 1,
    cellCoverage: 8,
    greedyDisjointWordCount: 2,
  });
  assert.deepEqual(measureBoard(board, trie), analysis.metrics);
});

test("generateBoard is seed-deterministic and preserves 6x6 board invariants", () => {
  const trie = buildWordTrie([
    "ace",
    "act",
    "ate",
    "cat",
    "dear",
    "eat",
    "note",
    "rate",
    "read",
    "stare",
    "tea",
    "tear",
  ]);
  const options = {
    seed: "unit-test-seed",
    evaluations: 7,
    letterPool: DEFAULT_LETTER_POOL,
    generatorVersion: "test-v1",
  } as const;

  const first = generateBoard({ trie, ...options });
  const second = generateBoard(trie, options);

  assert.deepEqual(second, first);
  assert.equal(first.rows.length, 6);
  for (const row of first.rows) {
    assert.match(row, /^[A-Z]{6}$/);
  }
  assert.deepEqual(
    first.letters,
    first.rows.map((row) => [...row]),
  );
  assert.equal(
    first.rows.join("").split("").sort().join(""),
    DEFAULT_LETTER_POOL.split("").sort().join(""),
  );
  assert.equal(first.evaluations, options.evaluations);
  assert.equal(first.seed, options.seed);
  assert.equal(first.generatorVersion, options.generatorVersion);
  assert.equal(
    first.id,
    createBoardId(first.rows, options.generatorVersion),
  );
});

test("createBoardId is stable and content-addressed", () => {
  const rows = [
    "ABCDEF",
    "GHIJKL",
    "MNOPQR",
    "STUVWX",
    "YZABCD",
    "EFGHIJ",
  ];
  const id = createBoardId(rows, "test-v1");

  assert.equal(id, "generated-test-v1-178b4ab8a2cf361d");
  assert.equal(createBoardId([...rows], "test-v1"), id);
  assert.notEqual(
    createBoardId([...rows.slice(0, -1), "EFGHIK"], "test-v1"),
    id,
  );
  assert.notEqual(createBoardId(rows, "test-v2"), id);
});
