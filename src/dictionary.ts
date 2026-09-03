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

export function dictionaryFromObject(entries: unknown): Set<string> {
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
}: LoadDictionaryOptions = {}): Promise<Set<string>> {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Dictionary request failed (${response.status})`);
  }

  return dictionaryFromObject(await response.json());
}
