import { useCallback, useEffect, useRef, useState } from "react";

import { loadDictionary } from "../dictionary";

export type DictionaryLoader = () => Promise<Set<string>>;

export type DictionaryState =
  | { readonly status: "loading"; readonly dictionary: null }
  | { readonly status: "ready"; readonly dictionary: ReadonlySet<string> }
  | { readonly status: "error"; readonly dictionary: null };

const LOADING_STATE: DictionaryState = {
  status: "loading",
  dictionary: null,
};

/** Load the dictionary once per attempt, including under React Strict Mode. */
export function useDictionary(
  loader: DictionaryLoader = loadDictionary,
): DictionaryState & { readonly retry: () => void } {
  const [state, setState] = useState<DictionaryState>(LOADING_STATE);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef<Promise<Set<string>>>(null);
  const loaderRef = useRef(loader);
  const generationRef = useRef(0);

  useEffect(() => {
    if (loaderRef.current !== loader) {
      loaderRef.current = loader;
      requestRef.current = null;
    }

    const generation = generationRef.current;
    const request = requestRef.current ?? Promise.resolve().then(loader);
    requestRef.current = request;
    let active = true;

    void request.then(
      (dictionary) => {
        if (active && generation === generationRef.current) {
          setState({ status: "ready", dictionary });
        }
      },
      (error: unknown) => {
        if (active && generation === generationRef.current) {
          console.error("Unable to load the Zoggle dictionary", error);
          setState({ status: "error", dictionary: null });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [attempt, loader]);

  const retry = useCallback(() => {
    generationRef.current += 1;
    requestRef.current = null;
    setState(LOADING_STATE);
    setAttempt((current) => current + 1);
  }, []);

  return { ...state, retry };
}
