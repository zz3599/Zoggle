const PLAYABLE_WORD = /^[a-z]+$/;

interface DictionaryResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

type DictionaryFetch = (url: string | URL) => Promise<DictionaryResponse>;

interface LoadDictionaryOptions {
  readonly fetchImpl?: DictionaryFetch;
  readonly url?: string | URL;
}

function playableWords(words: readonly unknown[]): Set<string> {
  return new Set(
    words.filter(
      (word): word is string =>
        typeof word === "string" &&
        word.length >= 3 &&
        PLAYABLE_WORD.test(word),
    ),
  );
}

export function dictionaryFromObject(entries: unknown): Set<string> {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new TypeError("Dictionary data must be an object keyed by word");
  }

  return playableWords(Object.keys(entries));
}

export function dictionaryFromArray(entries: unknown): Set<string> {
  if (!Array.isArray(entries)) {
    throw new TypeError("Dictionary data must be an array of words");
  }

  return playableWords(entries);
}

export async function loadDictionary({
  fetchImpl = globalThis.fetch,
  url = new URL("../assets/playable-words.json", import.meta.url),
}: LoadDictionaryOptions = {}): Promise<Set<string>> {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Dictionary request failed (${response.status})`);
  }

  const entries = await response.json();
  return Array.isArray(entries)
    ? dictionaryFromArray(entries)
    : dictionaryFromObject(entries);
}
