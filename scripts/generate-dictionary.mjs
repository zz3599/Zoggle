import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wordGameWords = require("an-array-of-english-words");
const lemmatize = require("wink-lemmatizer");
const sourceUrl = new URL("../assets/dictionary.json", import.meta.url);
const outputUrl = new URL("../assets/playable-words.json", import.meta.url);
const playableWord = /^[a-z]{3,}$/;
const dictionaryWord = /^[a-z]+$/;

/**
 * Use Webster as the source of base words. Then add an attested surface form
 * from the word-game list only when lemmatization links it to a Webster word.
 * Playable Webster headwords are included directly.
 */
const websterEntries = JSON.parse(await readFile(sourceUrl, "utf8"));
if (
  !websterEntries ||
  typeof websterEntries !== "object" ||
  Array.isArray(websterEntries)
) {
  throw new TypeError("Webster dictionary must be an object keyed by word");
}
if (!Array.isArray(wordGameWords)) {
  throw new TypeError("Word-game dictionary must be an array");
}

const websterWords = new Set(
  Object.keys(websterEntries).filter((word) => dictionaryWord.test(word)),
);
const words = new Set([...websterWords].filter((word) => playableWord.test(word)));

for (const word of wordGameWords) {
  if (
    typeof word === "string" &&
    playableWord.test(word) &&
    [lemmatize.noun(word), lemmatize.verb(word), lemmatize.adjective(word)]
      .some((lemma) => lemma !== word && websterWords.has(lemma))
  ) {
    words.add(word);
  }
}

const playableWords = [...words].sort();

await writeFile(outputUrl, `${JSON.stringify(playableWords)}\n`);
console.log(`Wrote ${playableWords.length.toLocaleString()} playable words.`);
