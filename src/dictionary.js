const PLAYABLE_WORD = /^[a-z]+$/;

export function dictionaryFromObject(entries) {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new TypeError("Dictionary data must be an object keyed by word");
  }

  return new Set(
    Object.keys(entries).filter(
      (word) => word.length >= 3 && PLAYABLE_WORD.test(word),
    ),
  );
}

export async function loadDictionary({
  fetchImpl = globalThis.fetch,
  url = new URL("../assets/dictionary.json", import.meta.url),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Dictionary request failed (${response.status})`);
  }

  return dictionaryFromObject(await response.json());
}
