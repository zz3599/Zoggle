import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../assets/dictionary.json", import.meta.url);
const outputUrl = new URL("../assets/playable-words.json", import.meta.url);
const playableWord = /^[a-z]{3,}$/;

const dictionaryEntries = JSON.parse(await readFile(sourceUrl, "utf8"));
if (
  !dictionaryEntries ||
  typeof dictionaryEntries !== "object" ||
  Array.isArray(dictionaryEntries)
) {
  throw new TypeError("Source dictionary must be an object keyed by word");
}

// The source stores every headword in uppercase. Normalize it for gameplay and
// discard entries containing punctuation, whitespace, or fewer than 3 letters.
const playableWords = [
  ...new Set(
    Object.keys(dictionaryEntries)
      .map((word) => word.toLowerCase())
      .filter((word) => playableWord.test(word)),
  ),
].sort();

await writeFile(outputUrl, `${JSON.stringify(playableWords)}\n`);
console.log(`Wrote ${playableWords.length.toLocaleString()} playable words.`);
