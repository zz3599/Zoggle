import assert from "node:assert/strict";
import { test } from "vitest";

import { extendPath, SelectionController } from "../src/selection";
import type { Coordinate } from "../src/types";

interface HarnessOptions {
  readonly enabled?: boolean;
  readonly isCellAvailable?: (coordinate: Coordinate) => boolean;
}

function createControllerHarness({
  enabled = true,
  isCellAvailable = () => true,
}: HarnessOptions = {}) {
  let targetAtPoint: unknown = null;
  let capturedPointer: number | null = null;
  const cells: HTMLElement[] = [];
  const pathChanges: Array<readonly Coordinate[]> = [];
  const submissions: Array<readonly Coordinate[]> = [];

  const documentRef = {
    addEventListener() {},
    removeEventListener() {},
    elementFromPoint() {
      return targetAtPoint;
    },
  } as unknown as Document;

  const boardElement = {
    ownerDocument: documentRef,
    addEventListener() {},
    removeEventListener() {},
    contains(target: { readonly isCell?: boolean } | null) {
      return target === boardElement || target?.isCell === true;
    },
    querySelectorAll() {
      return cells;
    },
    setPointerCapture(pointerId: number) {
      capturedPointer = pointerId;
    },
    hasPointerCapture(pointerId: number) {
      return capturedPointer === pointerId;
    },
    releasePointerCapture() {
      capturedPointer = null;
    },
  } as unknown as HTMLElement;

  const cell = (
    row: number,
    col: number,
    {
      left = col * 20,
      top = row * 20,
      right = left + 10,
      bottom = top + 10,
    }: Partial<Pick<DOMRect, "left" | "top" | "right" | "bottom">> = {},
  ): HTMLElement => {
    const element = {
      isCell: true,
      dataset: { row: String(row), col: String(col) },
      closest() {
        return element;
      },
      getBoundingClientRect() {
        return { left, top, right, bottom };
      },
    } as unknown as HTMLElement;
    cells.push(element);
    return element;
  };

  const controller = new SelectionController(boardElement, {
    isEnabled: () => enabled,
    isCellAvailable,
    onPathChange: (path) => pathChanges.push(path),
    onSubmit: (path) => submissions.push(path),
  });

  return {
    controller,
    pathChanges,
    submissions,
    boardElement,
    cell,
    setTargetAtPoint(target: unknown) {
      targetAtPoint = target;
    },
  };
}

function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    button: 0,
    pointerId: 7,
    clientX: 10,
    clientY: 10,
    preventDefault() {},
    ...overrides,
  } as PointerEvent;
}

test("extendPath starts a new path without retaining the candidate object", () => {
  const candidate = { row: 1, col: 2 };
  const result = extendPath([], candidate);

  assert.deepEqual(result, [candidate]);
  assert.notEqual(result[0], candidate);
});

test("extendPath adds adjacent unused cells without mutating the path", () => {
  const path = [{ row: 0, col: 0 }];
  const result = extendPath(path, { row: 1, col: 1 });

  assert.deepEqual(result, [
    { row: 0, col: 0 },
    { row: 1, col: 1 },
  ]);
  assert.deepEqual(path, [{ row: 0, col: 0 }]);
});

test("extendPath ignores the current cell, distant cells, and visited cells", () => {
  const path = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ];

  assert.equal(extendPath(path, { row: 1, col: 1 }), path);
  assert.equal(extendPath(path, { row: 3, col: 3 }), path);
  assert.equal(extendPath(path, { row: 0, col: 0 }), path);
});

test("extendPath backtracks when moving to the immediate predecessor", () => {
  const path = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ];

  const result = extendPath(path, { row: 0, col: 1 });

  assert.deepEqual(result, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]);
  assert.deepEqual(path, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ]);
});

test("extendPath permits a different branch after backtracking", () => {
  const original = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ];
  const backtracked = extendPath(original, { row: 0, col: 1 });
  const branched = extendPath(backtracked, { row: 0, col: 2 });

  assert.deepEqual(branched, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ]);
});

test("extendPath ignores malformed candidates and rejects a non-array path", () => {
  const path = [{ row: 0, col: 0 }];

  assert.equal(extendPath(path, { row: 1.5, col: 1 }), path);
  assert.equal(extendPath(path, null), path);
  // @ts-expect-error Exercise the runtime guard for JavaScript callers.
  assert.throws(() => extendPath(null, { row: 0, col: 0 }), /path/);
});

test("SelectionController submits a path built across pointer events", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);
  const second = harness.cell(0, 1);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(second);
  harness.controller.handlePointerMove(pointerEvent());
  harness.controller.handlePointerUp(pointerEvent());

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]]);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});

test("SelectionController rounds a pointer in a board gap to the closest cell", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0, {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
  });
  harness.cell(0, 1, {
    left: 110,
    top: 0,
    right: 210,
    bottom: 100,
  });

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(harness.boardElement);
  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 108, clientY: 95 }),
  );
  assert.deepEqual(harness.controller.path, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]);

  harness.controller.handlePointerUp(
    pointerEvent({ clientX: 108, clientY: 95 }),
  );

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]]);
});

test("SelectionController rounds a pointer in a vertical board gap", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0, {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
  });
  harness.cell(1, 0, {
    left: 0,
    top: 110,
    right: 100,
    bottom: 210,
  });

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(harness.boardElement);
  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 95, clientY: 108 }),
  );

  assert.deepEqual(harness.controller.path, [
    { row: 0, col: 0 },
    { row: 1, col: 0 },
  ]);
});

test("SelectionController rounds a pointer just outside the board", () => {
  const cases: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 1, 25, -2],
    [1, 0, -2, 25],
  ];

  for (const [row, col, clientX, clientY] of cases) {
    const harness = createControllerHarness();
    const first = harness.cell(0, 0);
    harness.cell(row, col);

    harness.controller.handlePointerDown(pointerEvent({ target: first }));
    harness.setTargetAtPoint({});
    harness.controller.handlePointerMove(pointerEvent({ clientX, clientY }));
    assert.deepEqual(harness.controller.path, [
      { row: 0, col: 0 },
      { row, col },
    ]);

    harness.controller.handlePointerUp(pointerEvent({ clientX, clientY }));

    assert.deepEqual(harness.submissions, [[
      { row: 0, col: 0 },
      { row, col },
    ]]);
  }
});

test("SelectionController rounds the final pointer position on release", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);
  harness.cell(0, 1);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(harness.boardElement);
  harness.controller.handlePointerUp(
    pointerEvent({ clientX: 18, clientY: 5 }),
  );

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]]);
});

test("SelectionController requires an exact tile hit for diagonal tracing", () => {
  for (const [clientX, clientY] of [
    [16, 14],
    [14, 16],
    [21, 14],
    [14, 21],
    [18, 18],
  ]) {
    const harness = createControllerHarness();
    const first = harness.cell(0, 0);
    harness.cell(0, 1);
    harness.cell(1, 0);
    const diagonal = harness.cell(1, 1);

    harness.controller.handlePointerDown(pointerEvent({ target: first }));
    harness.setTargetAtPoint(harness.boardElement);
    harness.controller.handlePointerMove(pointerEvent({ clientX, clientY }));

    assert.deepEqual(harness.controller.path, [{ row: 0, col: 0 }]);

    harness.setTargetAtPoint(diagonal);
    harness.controller.handlePointerMove(
      pointerEvent({ clientX: 25, clientY: 25 }),
    );
    harness.controller.handlePointerUp(
      pointerEvent({ clientX: 25, clientY: 25 }),
    );

    assert.deepEqual(harness.submissions, [[
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]]);
  }
});

test("SelectionController does not round a diagonal release", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);
  harness.cell(0, 1);
  harness.cell(1, 0);
  harness.cell(1, 1);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(harness.boardElement);
  harness.controller.handlePointerUp(
    pointerEvent({ clientX: 16, clientY: 14 }),
  );

  assert.deepEqual(harness.submissions, [[{ row: 0, col: 0 }]]);
});

test("SelectionController accepts an exact diagonal tile on release", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);
  const diagonal = harness.cell(1, 1);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(diagonal);
  harness.controller.handlePointerUp(
    pointerEvent({ clientX: 25, clientY: 25 }),
  );

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 1, col: 1 },
  ]]);
});

test("SelectionController does not round past an unavailable closest cell", () => {
  const harness = createControllerHarness({
    isCellAvailable: ({ row, col }) => row !== 0 || col !== 1,
  });
  const first = harness.cell(0, 0);
  harness.cell(0, 1);
  harness.cell(0, 2);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(harness.boardElement);
  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 18, clientY: 5 }),
  );

  assert.deepEqual(harness.controller.path, [{ row: 0, col: 0 }]);
});

test("SelectionController cancels without submitting on Escape or lost capture", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.controller.handleKeyDown({
    key: "Escape",
    preventDefault() {},
  } as KeyboardEvent);
  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.controller.handleLostPointerCapture(pointerEvent());
  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});

test("SelectionController destroys without notifying during cleanup", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  const changeCount = harness.pathChanges.length;
  harness.controller.destroy();

  assert.deepEqual(harness.controller.path, []);
  assert.equal(harness.pathChanges.length, changeCount);
});

test("SelectionController does not begin a path while disabled", () => {
  const harness = createControllerHarness({ enabled: false });

  harness.controller.handlePointerDown(
    pointerEvent({ target: harness.cell(0, 0) }),
  );

  assert.deepEqual(harness.pathChanges, []);
  assert.deepEqual(harness.submissions, []);
});

test("SelectionController does not start from or extend through unavailable cells", () => {
  const harness = createControllerHarness({
    isCellAvailable: ({ row, col }) => row !== 0 || col !== 1,
  });
  const first = harness.cell(0, 0);
  const unavailable = harness.cell(0, 1);
  const next = harness.cell(1, 0);

  harness.controller.handlePointerDown(pointerEvent({ target: unavailable }));
  assert.deepEqual(harness.pathChanges, []);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(unavailable);
  harness.controller.handlePointerMove(pointerEvent());
  harness.setTargetAtPoint(next);
  harness.controller.handlePointerMove(pointerEvent());
  harness.controller.handlePointerUp(pointerEvent());

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 1, col: 0 },
  ]]);
});

test("SelectionController does not submit near an unavailable cell", () => {
  const harness = createControllerHarness({
    isCellAvailable: ({ row, col }) => row !== 0 || col !== 1,
  });

  const first = harness.cell(0, 0);
  harness.cell(0, 1);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.setTargetAtPoint(harness.boardElement);
  harness.controller.handlePointerUp(
    pointerEvent({ clientX: 18, clientY: 5 }),
  );

  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});
