import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";

import {
  dictionaryFromArray,
  dictionaryFromObject,
  loadDictionary,
} from "../src/dictionary";

const generatedWords: unknown = JSON.parse(
  readFileSync(resolve("assets/playable-words.json"), "utf8"),
);

test("dictionaryFromObject keeps only playable Webster keys", () => {
  const dictionary = dictionaryFromObject({
    cat: "a feline",
    ox: "too short",
    "mother-in-law": "hyphenated",
    "ice cream": "contains a space",
    NASA: "capitalized",
  });

  assert.equal(dictionary.has("cat"), true);
  assert.equal(dictionary.has("ox"), false);
  assert.equal(dictionary.has("mother-in-law"), false);
  assert.equal(dictionary.has("ice cream"), false);
  assert.equal(dictionary.has("NASA"), false);
});

test("generated dictionary includes regular and irregular inflections", () => {
  const dictionary = dictionaryFromArray(generatedWords);

  for (const word of [
    "caters",
    "boxes",
    "carries",
    "walked",
    "planning",
    "quizzes",
    "potatoes",
    "goes",
    "brought",
    "dreamt",
    "oxen",
    "criteria",
    "phenomena",
    "arisen",
    "eaten",
  ]) {
    assert.equal(dictionary.has(word), true, word);
  }

  for (const word of [
    "runned",
    "taked",
    "quizes",
    "potatos",
    "compeled",
    "google",
    "facebook",
    "qwerty",
  ]) {
    assert.equal(dictionary.has(word), false, word);
  }
});

test("dictionaryFromObject rejects malformed data", () => {
  assert.throws(() => dictionaryFromObject([]), /object keyed by word/);
  assert.throws(() => dictionaryFromObject(null), /object keyed by word/);
  assert.throws(() => dictionaryFromArray({}), /array of words/);
  assert.throws(() => dictionaryFromArray(null), /array of words/);
});

test("loadDictionary reports an unsuccessful request", async () => {
  await assert.rejects(
    loadDictionary({
      fetchImpl: () => Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      }),
      url: "/missing.json",
    }),
    /failed \(404\)/,
  );
});

test("loadDictionary returns a playable word set", async () => {
  const dictionary = await loadDictionary({
    fetchImpl: () => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        "cat",
        "caters",
        "x-ray",
        "two words",
      ]),
    }),
    url: "/dictionary.json",
  });

  assert.equal(dictionary.has("cat"), true);
  assert.equal(dictionary.has("caters"), true);
  assert.equal(dictionary.has("x-ray"), false);
  assert.equal(dictionary.has("two words"), false);
});
