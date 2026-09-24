import assert from "node:assert/strict";
import { test } from "vitest";

import { buildWordTrie } from "../src/board-generation";
import { findHintWord } from "../src/hint";

test("findHintWord prefers the shortest word, then lexical order", () => {
  const trie = buildWordTrie(["dog", "cat", "dogcat"]);

  assert.equal(findHintWord(["DOGCAT"], trie)?.word, "cat");
});

test("findHintWord returns null when no eligible path remains", () => {
  assert.equal(
    findHintWord(["CAT"], buildWordTrie(["cat"]), {
      blockedCells: [{ row: 0, col: 1 }],
    }),
    null,
  );
});
