import assert from "node:assert/strict";
import { test, vi } from "vitest";

import {
  DEFAULT_BOARD_QUALITY_THRESHOLDS,
  buildWordTrie,
  type BoardMetrics,
  type GeneratedBoard,
} from "../src/board-generation";
import {
  handleFreshBoardRequest,
  type FreshBoardSearch,
} from "../src/fresh-board-worker-core";
import type { FreshBoardRequest } from "../src/fresh-board";

const REQUEST: FreshBoardRequest = {
  excludedIds: [],
  seed: "fresh-test",
  words: ["cat"],
};

const QUALIFIED_METRICS: BoardMetrics = {
  wordCount: DEFAULT_BOARD_QUALITY_THRESHOLDS.wordCount,
  potentialScore: DEFAULT_BOARD_QUALITY_THRESHOLDS.potentialScore,
  longestWordLength: 9,
  longWordCount: DEFAULT_BOARD_QUALITY_THRESHOLDS.longWordCount,
  cellCoverage: DEFAULT_BOARD_QUALITY_THRESHOLDS.cellCoverage,
  greedyDisjointWordCount:
    DEFAULT_BOARD_QUALITY_THRESHOLDS.greedyDisjointWordCount,
};

function generatedBoard(
  id: string,
  metrics: BoardMetrics = QUALIFIED_METRICS,
): GeneratedBoard {
  const rows = [
    "ABCDEF",
    "GHIJKL",
    "MNOPQR",
    "STUVWX",
    "YZABCD",
    "EFGHIJ",
  ];
  return {
    id,
    rows,
    letters: rows.map((row) => [...row]),
    metrics,
    seed: "unused",
    evaluations: 1,
    generatorVersion: "v1",
  };
}

test("fresh-board worker core returns a qualified board", () => {
  const board = generatedBoard("generated-v1-bec196738c5b76b2");
  const search = vi.fn<FreshBoardSearch>(() => board);

  const response = handleFreshBoardRequest(REQUEST, {
    evaluations: 7,
    maxAttempts: 3,
    search,
  });

  assert.deepEqual(response, {
    ok: true,
    board: {
      id: board.id,
      label: "Fresh board",
      letters: board.letters,
    },
  });
  assert.equal(search.mock.calls.length, 1);
  assert.equal(search.mock.calls[0]?.[1].seed, "fresh-test:1");
  assert.equal(search.mock.calls[0]?.[1].evaluations, 7);
  assert.deepEqual(
    search.mock.calls[0]?.[1].minimumMetrics,
    DEFAULT_BOARD_QUALITY_THRESHOLDS,
  );
});

test("fresh-board worker core retries excluded and unqualified candidates", () => {
  const excludedId = "generated-v1-aaaaaaaaaaaaaaaa";
  const unqualifiedMetrics = { ...QUALIFIED_METRICS, wordCount: 1 };
  const search = vi
    .fn<FreshBoardSearch>()
    .mockReturnValueOnce(generatedBoard(excludedId))
    .mockReturnValueOnce(
      generatedBoard("generated-v1-bbbbbbbbbbbbbbbb", unqualifiedMetrics),
    )
    .mockReturnValueOnce(generatedBoard("generated-v1-cccccccccccccccc"));

  const response = handleFreshBoardRequest(
    { ...REQUEST, excludedIds: [excludedId] },
    { evaluations: 2, maxAttempts: 3, search },
  );

  assert.equal(response.ok, true);
  if (response.ok) {
    assert.equal(response.board.id, "generated-v1-cccccccccccccccc");
  }
  assert.deepEqual(
    search.mock.calls.map((call) => call[1].seed),
    ["fresh-test:1", "fresh-test:2", "fresh-test:3"],
  );
  assert.equal(search.mock.calls[0]?.[0], search.mock.calls[2]?.[0]);
});

test("fresh-board worker core returns an error after bounded failures", () => {
  const search = vi.fn<FreshBoardSearch>(() =>
    generatedBoard("generated-v1-aaaaaaaaaaaaaaaa", {
      ...QUALIFIED_METRICS,
      cellCoverage: 35,
    }),
  );

  const response = handleFreshBoardRequest(REQUEST, {
    evaluations: 1,
    maxAttempts: 2,
    search,
  });

  assert.equal(response.ok, false);
  if (!response.ok) {
    assert.match(response.error, /after 2 attempts/);
    assert.match(response.error, /cellCoverage is 35/);
  }
  assert.equal(search.mock.calls.length, 2);
});

test("fresh-board worker core rejects malformed requests", () => {
  assert.deepEqual(handleFreshBoardRequest(null), {
    ok: false,
    error: "The fresh-board request is invalid.",
  });
  assert.deepEqual(
    handleFreshBoardRequest({ ...REQUEST, words: ["CAT"] }),
    {
      ok: false,
      error:
        "Dictionary words must contain only lowercase ASCII letters and be at least 3 letters long: CAT",
    },
  );
});

test("fresh-board worker core passes a real trie to its search dependency", () => {
  const expectedTrie = buildWordTrie(REQUEST.words);
  const search = vi.fn<FreshBoardSearch>((trie) => {
    assert.deepEqual(
      { wordCount: trie.wordCount, maxWordLength: trie.maxWordLength },
      {
        wordCount: expectedTrie.wordCount,
        maxWordLength: expectedTrie.maxWordLength,
      },
    );
    return generatedBoard("generated-v1-bec196738c5b76b2");
  });

  assert.equal(handleFreshBoardRequest(REQUEST, { search }).ok, true);
});
