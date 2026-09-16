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
    clientX: 5,
    clientY: 5,
    preventDefault() {},
    ...overrides,
  } as PointerEvent;
}

function pointerEventAt(
  target: HTMLElement,
  overrides: Partial<PointerEvent> = {},
): PointerEvent {
  const rect = target.getBoundingClientRect();
  return pointerEvent({
    target,
    clientX: (rect.left + rect.right) / 2,
    clientY: (rect.top + rect.bottom) / 2,
    ...overrides,
  });
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

test("extendPath ignores current, distant, and older visited cells", () => {
  const path = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 0 },
  ];

  assert.equal(extendPath(path, { row: 1, col: 0 }), path);
  assert.equal(extendPath(path, { row: 3, col: 3 }), path);
  assert.equal(extendPath(path, { row: 0, col: 0 }), path);
});

test("extendPath removes only the current cell when tracing to its predecessor", () => {
  const path = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ];

  const result = extendPath(path, { row: 0, col: 1 });

  assert.deepEqual(result, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]);
  assert.deepEqual(path, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ]);
});

test("extendPath extends from the traced-back cell", () => {
  const path = [
    { row: 3, col: 3 },
    { row: 3, col: 4 },
    { row: 3, col: 5 },
  ];
  const revisited = extendPath(path, { row: 3, col: 4 });
  const extended = extendPath(revisited, { row: 4, col: 4 });

  assert.deepEqual(extended, [
    { row: 3, col: 3 },
    { row: 3, col: 4 },
    { row: 4, col: 4 },
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

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.setTargetAtPoint(second);
  harness.controller.handlePointerMove(pointerEventAt(second));
  harness.controller.handlePointerUp(pointerEventAt(second));

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]]);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});

test("SelectionController deselects the current tile when tracing back one step", () => {
  const harness = createControllerHarness();
  const s = harness.cell(3, 3);
  const e = harness.cell(3, 4);
  const n = harness.cell(3, 5);
  const t = harness.cell(4, 4);

  harness.controller.handlePointerDown(pointerEventAt(s));
  for (const cell of [e, n]) {
    harness.setTargetAtPoint(cell);
    harness.controller.handlePointerMove(pointerEventAt(cell));
  }
  harness.setTargetAtPoint(e);
  harness.controller.handlePointerMove(pointerEventAt(e));
  assert.deepEqual(harness.controller.path, [
    { row: 3, col: 3 },
    { row: 3, col: 4 },
  ]);

  harness.setTargetAtPoint(t);
  harness.controller.handlePointerMove(pointerEventAt(t));
  harness.controller.handlePointerUp(pointerEventAt(t));

  assert.deepEqual(harness.submissions, [[
    { row: 3, col: 3 },
    { row: 3, col: 4 },
    { row: 4, col: 4 },
  ]]);
});

test("SelectionController traces back one step at the final pointer position", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);
  const second = harness.cell(0, 1);
  const third = harness.cell(0, 2);

  harness.controller.handlePointerDown(pointerEventAt(first));
  for (const cell of [second, third]) {
    harness.setTargetAtPoint(cell);
    harness.controller.handlePointerMove(pointerEventAt(cell));
  }

  harness.setTargetAtPoint(second);
  harness.controller.handlePointerUp(pointerEventAt(second));

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]]);
});

test("SelectionController ignores an older visited tile", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);
  const second = harness.cell(0, 1);
  const third = harness.cell(1, 1);
  const fourth = harness.cell(1, 0);

  harness.controller.handlePointerDown(pointerEventAt(first));
  for (const cell of [second, third, fourth]) {
    harness.setTargetAtPoint(cell);
    harness.controller.handlePointerMove(pointerEventAt(cell));
  }

  const changeCount = harness.pathChanges.length;
  harness.setTargetAtPoint(first);
  harness.controller.handlePointerMove(pointerEventAt(first));

  assert.equal(harness.pathChanges.length, changeCount);
  assert.deepEqual(harness.controller.path, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 0 },
  ]);

  harness.controller.handlePointerUp(pointerEventAt(first));
  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 0 },
  ]]);
});

test("SelectionController starts only inside a tile's centered 80% hit box", () => {
  const acceptedPoints: ReadonlyArray<readonly [number, number]> = [
    [30, 35],
    [110, 75],
    [70, 55],
  ];
  const rejectedPoints: ReadonlyArray<readonly [number, number]> = [
    [29.9, 55],
    [110.1, 55],
    [70, 34.9],
    [70, 75.1],
  ];

  for (const [clientX, clientY] of acceptedPoints) {
    const harness = createControllerHarness();
    const cell = harness.cell(0, 0, {
      left: 20,
      top: 30,
      right: 120,
      bottom: 80,
    });

    harness.controller.handlePointerDown(
      pointerEvent({ target: cell, clientX, clientY }),
    );

    assert.deepEqual(harness.controller.path, [{ row: 0, col: 0 }]);
  }

  for (const [clientX, clientY] of rejectedPoints) {
    const harness = createControllerHarness();
    const cell = harness.cell(0, 0, {
      left: 20,
      top: 30,
      right: 120,
      bottom: 80,
    });

    harness.controller.handlePointerDown(
      pointerEvent({ target: cell, clientX, clientY }),
    );

    assert.deepEqual(harness.controller.path, []);
  }
});

test("SelectionController extends only inside a tile's centered 80% hit box", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0, {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
  });
  const second = harness.cell(0, 1, {
    left: 110,
    top: 0,
    right: 210,
    bottom: 100,
  });

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.setTargetAtPoint(second);
  for (const [clientX, clientY] of [
    [119.9, 50],
    [200.1, 50],
    [160, 9.9],
    [160, 90.1],
  ]) {
    harness.controller.handlePointerMove(pointerEvent({ clientX, clientY }));
  }
  assert.deepEqual(harness.controller.path, [{ row: 0, col: 0 }]);

  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 120, clientY: 10 }),
  );
  assert.deepEqual(harness.controller.path, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]);
});

test("SelectionController does not round a point in a gap or outside the board", () => {
  for (const [target, clientX, clientY] of [
    ["board", 105, 50],
    ["outside", 160, -1],
  ] as const) {
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

    harness.controller.handlePointerDown(pointerEventAt(first));
    harness.setTargetAtPoint(
      target === "board" ? harness.boardElement : {},
    );
    harness.controller.handlePointerMove(pointerEvent({ clientX, clientY }));
    harness.controller.handlePointerUp(pointerEvent({ clientX, clientY }));

    assert.deepEqual(harness.submissions, [[{ row: 0, col: 0 }]]);
  }
});

test("SelectionController ignores side-tile edges during a diagonal trace", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0, {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
  });
  const right = harness.cell(0, 1, {
    left: 110,
    top: 0,
    right: 210,
    bottom: 100,
  });
  const down = harness.cell(1, 0, {
    left: 0,
    top: 110,
    right: 100,
    bottom: 210,
  });
  const diagonal = harness.cell(1, 1, {
    left: 110,
    top: 110,
    right: 210,
    bottom: 210,
  });

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.setTargetAtPoint(right);
  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 115, clientY: 95 }),
  );
  harness.setTargetAtPoint(down);
  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 95, clientY: 115 }),
  );
  assert.deepEqual(harness.controller.path, [{ row: 0, col: 0 }]);

  harness.setTargetAtPoint(diagonal);
  harness.controller.handlePointerMove(
    pointerEvent({ clientX: 120, clientY: 120 }),
  );
  harness.controller.handlePointerUp(
    pointerEvent({ clientX: 120, clientY: 120 }),
  );

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 1, col: 1 },
  ]]);
});

test("SelectionController applies the 80% hit box to the final pointer position", () => {
  for (const [clientX, expectedPath] of [
    [119.9, [{ row: 0, col: 0 }]],
    [120, [{ row: 0, col: 0 }, { row: 0, col: 1 }]],
  ] as const) {
    const harness = createControllerHarness();
    const first = harness.cell(0, 0, {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
    });
    const second = harness.cell(0, 1, {
      left: 110,
      top: 0,
      right: 210,
      bottom: 100,
    });

    harness.controller.handlePointerDown(pointerEventAt(first));
    harness.setTargetAtPoint(second);
    harness.controller.handlePointerUp(
      pointerEvent({ clientX, clientY: 50 }),
    );

    assert.deepEqual(harness.submissions, [expectedPath]);
  }
});

test("SelectionController rejects non-finite points and invalid tile bounds", () => {
  const harness = createControllerHarness();
  const zeroSized = harness.cell(0, 0, {
    left: 5,
    top: 5,
    right: 5,
    bottom: 5,
  });
  const valid = harness.cell(0, 1);

  harness.controller.handlePointerDown(pointerEventAt(zeroSized));
  assert.deepEqual(harness.controller.path, []);

  harness.controller.handlePointerDown(
    pointerEventAt(valid, { clientX: Number.NaN }),
  );
  assert.deepEqual(harness.controller.path, []);
});

test("SelectionController cancels without submitting on Escape or lost capture", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.controller.handleKeyDown({
    key: "Escape",
    preventDefault() {},
  } as KeyboardEvent);
  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.controller.handleLostPointerCapture(pointerEvent());
  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});

test("SelectionController destroys without notifying during cleanup", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);

  harness.controller.handlePointerDown(pointerEventAt(first));
  const changeCount = harness.pathChanges.length;
  harness.controller.destroy();

  assert.deepEqual(harness.controller.path, []);
  assert.equal(harness.pathChanges.length, changeCount);
});

test("SelectionController does not begin a path while disabled", () => {
  const harness = createControllerHarness({ enabled: false });

  harness.controller.handlePointerDown(
    pointerEventAt(harness.cell(0, 0)),
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

  harness.controller.handlePointerDown(pointerEventAt(unavailable));
  assert.deepEqual(harness.pathChanges, []);

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.setTargetAtPoint(unavailable);
  harness.controller.handlePointerMove(pointerEventAt(unavailable));
  harness.setTargetAtPoint(next);
  harness.controller.handlePointerMove(pointerEventAt(next));
  harness.controller.handlePointerUp(pointerEventAt(next));

  assert.deepEqual(harness.submissions, [[
    { row: 0, col: 0 },
    { row: 1, col: 0 },
  ]]);
});

test("SelectionController does not submit when released inside an unavailable cell", () => {
  const harness = createControllerHarness({
    isCellAvailable: ({ row, col }) => row !== 0 || col !== 1,
  });

  const first = harness.cell(0, 0);
  const unavailable = harness.cell(0, 1);

  harness.controller.handlePointerDown(pointerEventAt(first));
  harness.setTargetAtPoint(unavailable);
  harness.controller.handlePointerUp(pointerEventAt(unavailable));

  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});
