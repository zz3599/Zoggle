import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import { createBoardId } from "../src/board-id";
import {
  generateFreshBoard,
  type FreshBoardRequest,
} from "../src/fresh-board";
import type { BoardDefinition } from "../src/types";

type WorkerListener = (event: Event) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly messages: unknown[] = [];
  readonly listeners = new Map<string, WorkerListener[]>();
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const callback: WorkerListener = typeof listener === "function"
      ? listener
      : (event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const GENERATED_ROWS = [
  "ABCDEF",
  "GHIJKL",
  "MNOPQR",
  "STUVWX",
  "YZABCD",
  "EFGHIJ",
];
const GENERATED_BOARD: BoardDefinition = {
  id: createBoardId(GENERATED_ROWS),
  label: "Fresh board",
  letters: GENERATED_ROWS.map((row) => [...row]),
};

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("generateFreshBoard sends a fresh seed and resolves a validated worker board", async () => {
  const promise = generateFreshBoard(new Set(["cat", "dog"]), {
    excludedBoardIds: ["generated-v1-aaaaaaaaaaaaaaaa"],
  });
  const worker = FakeWorker.instances[0];
  assert.ok(worker);

  assert.equal(worker.messages.length, 1);
  const request = worker.messages[0] as FreshBoardRequest;
  assert.match(request.seed, /^browser-(?:[0-9a-f]{32}|[a-z0-9]+-[a-z0-9]+)$/);
  assert.deepEqual(request.words, ["cat", "dog"]);
  assert.deepEqual(request.excludedIds, ["generated-v1-aaaaaaaaaaaaaaaa"]);

  worker.emit(
    "message",
    new MessageEvent("message", {
      data: { ok: true, board: GENERATED_BOARD },
    }),
  );

  await assert.doesNotReject(promise);
  assert.deepEqual(await promise, GENERATED_BOARD);
  assert.equal(worker.terminated, true);
});

test("generateFreshBoard rejects malformed worker output", async () => {
  const promise = generateFreshBoard(new Set(["cat"]));
  const worker = FakeWorker.instances[0];
  assert.ok(worker);

  worker.emit(
    "message",
    new MessageEvent("message", {
      data: { ok: true, board: { ...GENERATED_BOARD, letters: [["A"]] } },
    }),
  );

  await assert.rejects(promise, /invalid response/);
  assert.equal(worker.terminated, true);
});

test("generateFreshBoard rejects an id that does not match the board", async () => {
  const promise = generateFreshBoard(new Set(["cat"]));
  const worker = FakeWorker.instances[0];
  assert.ok(worker);

  worker.emit(
    "message",
    new MessageEvent("message", {
      data: {
        ok: true,
        board: {
          ...GENERATED_BOARD,
          id: "generated-v1-0000000000000000",
        },
      },
    }),
  );

  await assert.rejects(promise, /invalid response/);
  assert.equal(worker.terminated, true);
});

test("generateFreshBoard rejects a board excluded by the caller", async () => {
  const promise = generateFreshBoard(new Set(["cat"]), {
    excludedBoardIds: [GENERATED_BOARD.id],
  });
  const worker = FakeWorker.instances[0];
  assert.ok(worker);

  worker.emit(
    "message",
    new MessageEvent("message", {
      data: { ok: true, board: GENERATED_BOARD },
    }),
  );

  await assert.rejects(promise, /duplicate board/);
  assert.equal(worker.terminated, true);
});

test("generateFreshBoard terminates its worker when cancelled", async () => {
  const controller = new AbortController();
  const promise = generateFreshBoard(new Set(["cat"]), {
    signal: controller.signal,
  });
  const worker = FakeWorker.instances[0];
  assert.ok(worker);

  controller.abort();

  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(worker.terminated, true);
});
