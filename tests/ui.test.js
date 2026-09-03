import test from "node:test";
import assert from "node:assert/strict";

import { GameView } from "../src/ui.js";

function fakeElement() {
  const classes = new Set();

  return {
    attributes: new Map(),
    children: [],
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    dataset: {},
    hidden: false,
    textContent: "",
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
}

function createView() {
  const selectors = [
    "#board",
    "#board-name",
    "#current-word",
    "#score-value",
    "#high-score-value",
    "#timer-value",
    "#status",
    "#found-words",
    "#found-count",
    "#round-actions",
    "#round-expired-message",
    "#retry-load",
    "#restart-board",
    "#new-board",
  ];
  const elements = new Map(
    selectors.map((selector) => [selector, fakeElement()]),
  );
  const documentRef = {
    querySelector(selector) {
      return elements.get(selector) ?? null;
    },
    createElement() {
      return fakeElement();
    },
  };

  return { elements, view: new GameView(documentRef) };
}

function snapshot({ expired = false } = {}) {
  return {
    remainingMs: expired ? 0 : 60_000,
    expired,
    score: 0,
    highScore: 0,
    foundWords: [],
    usedCells: [],
  };
}

test("offers Play again during an active round", () => {
  const { elements, view } = createView();

  view.showLoading();
  assert.equal(elements.get("#round-actions").hidden, true);

  view.renderRound(snapshot());

  assert.equal(elements.get("#round-actions").hidden, false);
  assert.equal(elements.get("#restart-board").hidden, false);
  assert.equal(elements.get("#round-expired-message").hidden, true);
  assert.equal(elements.get("#new-board").hidden, true);
});

test("reveals the expiration-only actions when time runs out", () => {
  const { elements, view } = createView();

  view.renderRound(snapshot({ expired: true }));

  assert.equal(elements.get("#round-actions").hidden, false);
  assert.equal(elements.get("#restart-board").hidden, false);
  assert.equal(elements.get("#round-expired-message").hidden, false);
  assert.equal(elements.get("#new-board").hidden, false);
  assert.equal(elements.get("#board").attributes.get("aria-disabled"), "true");
});
