import test from "node:test";
import assert from "node:assert/strict";

import { extendPath, SelectionController } from "../src/selection.js";

function createControllerHarness({ enabled = true } = {}) {
  let targetAtPoint = null;
  let capturedPointer = null;
  const pathChanges = [];
  const submissions = [];

  const documentRef = {
    addEventListener() {},
    removeEventListener() {},
    elementFromPoint() {
      return targetAtPoint;
    },
  };

  const boardElement = {
    ownerDocument: documentRef,
    addEventListener() {},
    removeEventListener() {},
    contains(target) {
      return target?.isCell === true;
    },
    setPointerCapture(pointerId) {
      capturedPointer = pointerId;
    },
    hasPointerCapture(pointerId) {
      return capturedPointer === pointerId;
    },
    releasePointerCapture() {
      capturedPointer = null;
    },
  };

  const cell = (row, col) => {
    const element = {
      isCell: true,
      dataset: { row: String(row), col: String(col) },
      closest() {
        return element;
      },
    };
    return element;
  };

  const controller = new SelectionController(boardElement, {
    isEnabled: () => enabled,
    onPathChange: (path) => pathChanges.push(path),
    onSubmit: (path) => submissions.push(path),
  });

  return {
    controller,
    pathChanges,
    submissions,
    cell,
    setTargetAtPoint(target) {
      targetAtPoint = target;
    },
  };
}

function pointerEvent(overrides = {}) {
  return {
    button: 0,
    pointerId: 7,
    clientX: 10,
    clientY: 10,
    preventDefault() {},
    ...overrides,
  };
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

test("SelectionController cancels without submitting on Escape or lost capture", () => {
  const harness = createControllerHarness();
  const first = harness.cell(0, 0);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.controller.handleKeyDown({ key: "Escape", preventDefault() {} });
  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);

  harness.controller.handlePointerDown(pointerEvent({ target: first }));
  harness.controller.handleLostPointerCapture(pointerEvent());
  assert.deepEqual(harness.submissions, []);
  assert.deepEqual(harness.pathChanges.at(-1), []);
});

test("SelectionController does not begin a path while disabled", () => {
  const harness = createControllerHarness({ enabled: false });

  harness.controller.handlePointerDown(
    pointerEvent({ target: harness.cell(0, 0) }),
  );

  assert.deepEqual(harness.pathChanges, []);
  assert.deepEqual(harness.submissions, []);
});
