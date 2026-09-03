import test from "node:test";
import assert from "node:assert/strict";

import { extendPath } from "../src/selection.js";

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
