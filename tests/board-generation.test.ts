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

test("solveBoard finds an alternate path when the canonical path is blocked", () => {
  const words = solveBoard(["AA", "AA"], buildWordTrie(["aaa"]), {
    blockedCells: ["0,0"],
  });

  assert.deepEqual(words, [{
    word: "aaa",
    path: [
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    pathMask: 14n,
  }]);
});

test("solveBoard returns no words when every route is blocked", () => {
  assert.deepEqual(
    solveBoard(["CAT"], buildWordTrie(["cat"]), {
      blockedCells: [{ row: 0, col: 1 }],
    }),
    [],
  );
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
    potentialScore: 22,
    longestWordLength: 8,
    longWordCount: 1,
    cellCoverage: 8,
    greedyDisjointWordCount: 2,
  });
  assert.deepEqual(measureBoard(board, trie), analysis.metrics);
});

test("measureBoard matches full analysis across duplicate paths and compact masks", () => {
  const fixtures = [
    {
      board: ["ABCA", "BCAB", "CABC"],
      words: [
        "abc",
        "bca",
        "cab",
        "abca",
        "bcab",
        "cabc",
        "abcabc",
        "bcabca",
        "cabcab",
      ],
      expected: {
        wordCount: 9,
        potentialScore: 21,
        longestWordLength: 6,
        longWordCount: 0,
        cellCoverage: 12,
        greedyDisjointWordCount: 3,
      },
    },
    {
      board: ["ABAB", "BABA", "ABAB"],
      words: [
        "aba",
        "bab",
        "abab",
        "baba",
        "ababa",
        "babab",
        "abababa",
        "bababab",
      ],
      expected: {
        wordCount: 8,
        potentialScore: 34,
        longestWordLength: 7,
        longWordCount: 2,
        cellCoverage: 12,
        greedyDisjointWordCount: 2,
      },
    },
  ] as const;

  for (const fixture of fixtures) {
    const trie = buildWordTrie(fixture.words);
    const analysis = analyzeBoard(fixture.board, trie);

    assert.deepEqual(analysis.metrics, fixture.expected);
    assert.deepEqual(measureBoard(fixture.board, trie), analysis.metrics);
  }
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
  assert.deepEqual(first.metrics, analyzeBoard(first.rows, trie).metrics);
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
