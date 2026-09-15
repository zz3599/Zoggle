import assert from "node:assert/strict";
import { test } from "vitest";

import { buildWordTrie } from "../src/board-generation";
import {
  MAX_CASCADE_DEPTH,
  compareCascadeCandidates,
  findBestCascadeCandidate,
  type CascadeCandidate,
} from "../src/endless-cascade";

test("caps automatic Endless cascades", () => {
  assert.equal(MAX_CASCADE_DEPTH, 8);
});

test("selects the longest genuinely new frontier word", () => {
  const candidate = findBestCascadeCandidate({
    beforeBoard: ["ZZZZZ"],
    afterBoard: ["CATER"],
    frontier: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
    ],
    trie: buildWordTrie(["cat", "cater"]),
  });

  assert.deepEqual(candidate, {
    word: "cater",
    path: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
    ],
    pathMask: 31n,
    score: 3,
    frontierCellCount: 5,
    projectedGravityPotential: 0,
  });
});

test("rejects words present before gravity or absent from its frontier", () => {
  const trie = buildWordTrie(["cat", "dog"]);

  assert.equal(
    findBestCascadeCandidate({
      beforeBoard: ["CATXXX"],
      afterBoard: ["CATDOG"],
      frontier: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      trie,
    }),
    null,
  );

  assert.equal(
    findBestCascadeCandidate({
      beforeBoard: ["XXXXXX"],
      afterBoard: ["CATDOG"],
      frontier: [],
      trie,
    }),
    null,
  );
});

test("excludes words already awarded in the round", () => {
  const candidate = findBestCascadeCandidate({
    beforeBoard: ["ZZZZZ"],
    afterBoard: ["CATER"],
    frontier: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
    ],
    trie: buildWordTrie(["cat", "cater"]),
    excludedWords: ["cater"],
  });

  assert.equal(candidate?.word, "cat");
});

test("prefers paths containing more gravity-frontier cells", () => {
  const candidate = findBestCascadeCandidate({
    beforeBoard: ["XXXXXX"],
    afterBoard: ["CATDOG"],
    frontier: [
      { row: 0, col: 0 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 0, col: 5 },
    ],
    trie: buildWordTrie(["cat", "dog"]),
  });

  assert.equal(candidate?.word, "dog");
  assert.equal(candidate?.frontierCellCount, 3);
});

test("prefers the removal with more projected falling motion", () => {
  const candidate = findBestCascadeCandidate({
    beforeBoard: ["XXX", "XXX"],
    afterBoard: ["CAT", "DOG"],
    frontier: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ],
    trie: buildWordTrie(["cat", "dog"]),
  });

  assert.equal(candidate?.word, "dog");
  assert.equal(candidate?.projectedGravityPotential, 3);
});

test("breaks otherwise equal ties lexically, independent of dictionary order", () => {
  for (const dictionary of [
    ["dog", "cat"],
    ["cat", "dog"],
  ]) {
    const candidate = findBestCascadeCandidate({
      beforeBoard: ["XXXXXX"],
      afterBoard: ["CATDOG"],
      frontier: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 0, col: 3 },
        { row: 0, col: 4 },
        { row: 0, col: 5 },
      ],
      trie: buildWordTrie(dictionary),
    });

    assert.equal(candidate?.word, "cat");
  }
});

test("uses row-major path order as the final stable tie-break", () => {
  const common = {
    word: "cat",
    pathMask: 7n,
    score: 1,
    frontierCellCount: 3,
    projectedGravityPotential: 0,
  };
  const earlier: CascadeCandidate = {
    ...common,
    path: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
  };
  const later: CascadeCandidate = {
    ...common,
    path: [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ],
  };

  assert.ok(compareCascadeCandidates(earlier, later) < 0);
  assert.ok(compareCascadeCandidates(later, earlier) > 0);
});
