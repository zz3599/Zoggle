import assert from "node:assert/strict";
import { test } from "vitest";

import { dictionaryFromObject, loadDictionary } from "../src/dictionary";

test("dictionaryFromObject keeps only playable dictionary keys", () => {
  const dictionary = dictionaryFromObject({
    cat: "a feline",
    ox: "too short",
    "mother-in-law": "hyphenated",
    "ice cream": "contains a space",
    NASA: "capitalized",
  });

  assert.deepEqual([...dictionary], ["cat"]);
});

test("dictionaryFromObject rejects malformed data", () => {
  assert.throws(() => dictionaryFromObject([]), /object keyed by word/);
  assert.throws(() => dictionaryFromObject(null), /object keyed by word/);
});

test("loadDictionary reports an unsuccessful request", async () => {
  await assert.rejects(
    loadDictionary({
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
      url: "/missing.json",
    }),
    /failed \(404\)/,
  );
});

test("loadDictionary returns a playable word set", async () => {
  const dictionary = await loadDictionary({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cat: "a feline", "x-ray": "hyphenated" }),
    }),
    url: "/dictionary.json",
  });

  assert.equal(dictionary.has("cat"), true);
  assert.equal(dictionary.has("x-ray"), false);
});
