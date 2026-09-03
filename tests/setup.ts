import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const entries = new Map<string, string>();
const storage: Storage = {
  get length() {
    return entries.size;
  },
  clear() {
    entries.clear();
  },
  getItem(key) {
    return entries.get(key) ?? null;
  },
  key(index) {
    return [...entries.keys()][index] ?? null;
  },
  removeItem(key) {
    entries.delete(key);
  },
  setItem(key, value) {
    entries.set(key, value);
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

let elementAtPoint: Element | null = null;
Object.defineProperty(document, "elementFromPoint", {
  configurable: true,
  value: () => elementAtPoint,
});

export function setElementAtPoint(element: Element | null): void {
  elementAtPoint = element;
}

afterEach(() => {
  cleanup();
  elementAtPoint = null;
  storage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
