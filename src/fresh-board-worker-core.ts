import {
  DEFAULT_BOARD_QUALITY_THRESHOLDS,
  buildWordTrie,
  generateBoard,
  type BoardMetrics,
  type BoardSearchOptions,
  type GeneratedBoard,
  type WordTrie,
} from "./board-generation";
import type { FreshBoardRequest, FreshBoardResponse } from "./fresh-board";
import type { BoardDefinition } from "./types";

export const INTERACTIVE_SEARCH_EVALUATIONS = 200;
export const MAX_INTERACTIVE_SEARCH_ATTEMPTS = 3;

export type FreshBoardSearch = (
  trie: WordTrie,
  options: BoardSearchOptions,
) => GeneratedBoard;

interface FreshBoardSearchDependencies {
  readonly evaluations?: number;
  readonly maxAttempts?: number;
  readonly search?: FreshBoardSearch;
}

function isFreshBoardRequest(value: unknown): value is FreshBoardRequest {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    readonly excludedIds?: unknown;
    readonly seed?: unknown;
    readonly words?: unknown;
  };
  return (
    typeof candidate.seed === "string" &&
    candidate.seed.length > 0 &&
    Array.isArray(candidate.excludedIds) &&
    candidate.excludedIds.every((id: unknown) => typeof id === "string") &&
    Array.isArray(candidate.words) &&
    candidate.words.length > 0 &&
    candidate.words.every((word: unknown) => typeof word === "string")
  );
}

function missedThreshold(metrics: BoardMetrics): string | null {
  for (const [name, minimum] of Object.entries(
    DEFAULT_BOARD_QUALITY_THRESHOLDS,
  )) {
    const metricName = name as keyof BoardMetrics;
    if (metrics[metricName] < minimum) {
      return `${name} is ${metrics[metricName]}; expected at least ${minimum}`;
    }
  }
  return null;
}

function boardDefinition(generated: GeneratedBoard): BoardDefinition {
  return {
    id: generated.id,
    label: "Fresh board",
    letters: generated.letters,
  };
}

/** Handle one worker request without depending on Worker globals. */
export function handleFreshBoardRequest(
  value: unknown,
  dependencies: FreshBoardSearchDependencies = {},
): FreshBoardResponse {
  try {
    if (!isFreshBoardRequest(value)) {
      throw new TypeError("The fresh-board request is invalid.");
    }

    const evaluations =
      dependencies.evaluations ?? INTERACTIVE_SEARCH_EVALUATIONS;
    const maxAttempts =
      dependencies.maxAttempts ?? MAX_INTERACTIVE_SEARCH_ATTEMPTS;
    if (!Number.isSafeInteger(evaluations) || evaluations < 1) {
      throw new RangeError("Interactive evaluations must be a positive integer.");
    }
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError("Interactive attempts must be a positive integer.");
    }

    const trie = buildWordTrie(value.words);
    const excluded = new Set(value.excludedIds);
    const search: FreshBoardSearch =
      dependencies.search ?? ((wordTrie, options) => generateBoard(wordTrie, options));
    let lastFailure = "no candidate was generated";

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const generated = search(trie, {
        seed: `${value.seed}:${attempt + 1}`,
        evaluations,
        minimumMetrics: DEFAULT_BOARD_QUALITY_THRESHOLDS,
      });
      const failure = missedThreshold(generated.metrics);
      if (failure === null && !excluded.has(generated.id)) {
        return { ok: true, board: boardDefinition(generated) };
      }
      lastFailure = failure ?? `board ${generated.id} already exists`;
    }

    throw new Error(
      `Unable to generate a new board after ${maxAttempts} attempts: ${lastFailure}.`,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Board generation failed.",
    };
  }
}
