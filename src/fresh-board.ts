import { BOARD_GENERATOR_VERSION, createBoardId } from "./board-id";
import type { BoardDefinition } from "./types";

export interface FreshBoardRequest {
  readonly excludedIds: readonly string[];
  readonly seed: string;
  readonly words: readonly string[];
}

export type FreshBoardResponse =
  | { readonly ok: true; readonly board: BoardDefinition }
  | { readonly ok: false; readonly error: string };

export interface FreshBoardGenerationOptions {
  readonly excludedBoardIds?: readonly string[];
  readonly signal?: AbortSignal;
}

export type FreshBoardGenerator = (
  dictionary: ReadonlySet<string>,
  options?: FreshBoardGenerationOptions,
) => Promise<BoardDefinition>;

const GENERATION_TIMEOUT_MS = 60_000;

function freshBoardSeed(): string {
  const randomValues = new Uint32Array(4);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(randomValues);
    return `browser-${[...randomValues]
      .map((value) => value.toString(16).padStart(8, "0"))
      .join("")}`;
  }

  return `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isLetterGrid(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every(
      (row: unknown) =>
        Array.isArray(row) &&
        row.length === 6 &&
        row.every(
          (letter: unknown) =>
            typeof letter === "string" && /^[A-Z]$/.test(letter),
        ),
    )
  );
}

function isBoardDefinition(value: unknown): value is BoardDefinition {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    readonly id?: unknown;
    readonly label?: unknown;
    readonly letters?: unknown;
  };
  if (
    typeof candidate.id !== "string" ||
    (candidate.label !== undefined &&
      (typeof candidate.label !== "string" || candidate.label.length === 0)) ||
    !isLetterGrid(candidate.letters)
  ) {
    return false;
  }

  const rows = candidate.letters.map((row) => row.join(""));
  return candidate.id === createBoardId(rows, BOARD_GENERATOR_VERSION);
}

function abortError(): Error {
  const error = new Error("Fresh-board generation was cancelled.");
  error.name = "AbortError";
  return error;
}

/** Run a bounded board search in a disposable worker so play remains responsive. */
export const generateFreshBoard: FreshBoardGenerator = (dictionary, options) => {
  const abortSignal = options?.signal;
  const excludedBoardIds = new Set(options?.excludedBoardIds ?? []);
  if (abortSignal?.aborted) return Promise.reject(abortError());
  if (dictionary.size === 0) {
    return Promise.reject(new RangeError("A dictionary is required to generate a board."));
  }

  return new Promise<BoardDefinition>((resolve, reject) => {
    const worker = new Worker(
      new URL("./generate-board.worker.ts", import.meta.url),
      { name: "zoggle-fresh-board", type: "module" },
    );
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      fail(new Error("Fresh-board generation took too long."));
    }, GENERATION_TIMEOUT_MS);

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      worker.terminate();
      abortSignal?.removeEventListener("abort", handleAbort);
    };
    const succeed = (board: BoardDefinition) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(board);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const handleAbort = () => fail(abortError());

    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const response = event.data;
      if (typeof response !== "object" || response === null || !("ok" in response)) {
        fail(new TypeError("The board worker returned an invalid response."));
        return;
      }

      const candidate = response as {
        readonly ok?: unknown;
        readonly board?: unknown;
        readonly error?: unknown;
      };
      if (candidate.ok === true && isBoardDefinition(candidate.board)) {
        if (excludedBoardIds.has(candidate.board.id)) {
          fail(new Error("The board worker returned a duplicate board."));
        } else {
          succeed(candidate.board);
        }
      } else if (candidate.ok === false && typeof candidate.error === "string") {
        fail(new Error(candidate.error));
      } else {
        fail(new TypeError("The board worker returned an invalid response."));
      }
    });
    worker.addEventListener("error", (event) => {
      fail(new Error(event.message || "The board worker failed."));
    });
    worker.addEventListener("messageerror", () => {
      fail(new TypeError("The board worker response could not be read."));
    });
    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    const request: FreshBoardRequest = {
      excludedIds: options?.excludedBoardIds ?? [],
      seed: freshBoardSeed(),
      words: [...dictionary],
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      fail(error);
    }
  });
};
