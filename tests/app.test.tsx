import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { App } from "../src/App";
import { dictionaryFromArray } from "../src/dictionary";
import { setElementAtPoint } from "./setup";

const READY_MESSAGE = "Hold and drag across neighboring letters to make a word.";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function boardCells(): HTMLElement[] {
  const board = screen.getByRole("group", { name: /board, 6 by 6/ });
  return within(board).getAllByRole("button");
}

function traceCells(...cells: HTMLElement[]): void {
  const first = cells[0];
  if (!first) throw new Error("At least one cell is required");

  fireEvent.pointerDown(first, {
    button: 0,
    pointerId: 7,
    clientX: 5,
    clientY: 5,
  });

  for (const [index, cell] of cells.slice(1).entries()) {
    setElementAtPoint(cell);
    fireEvent.pointerMove(document, {
      pointerId: 7,
      clientX: 25 + index * 20,
      clientY: 5,
    });
  }

  setElementAtPoint(cells.at(-1) ?? null);
  fireEvent.pointerUp(document, {
    pointerId: 7,
    clientX: 25 + cells.length * 20,
    clientY: 5,
  });
}

async function renderReady(dictionary = new Set(["cat"])) {
  const dictionaryLoader = vi.fn(() => Promise.resolve(dictionary));
  const result = render(
    <StrictMode>
      <App dictionaryLoader={dictionaryLoader} />
    </StrictMode>,
  );

  expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
  return { ...result, dictionaryLoader };
}

describe("App", () => {
  test("shows each scoring category on its own row", async () => {
    await renderReady();

    const scoring = screen.getByRole("list", { name: "Scoring" });
    expect(within(scoring).getAllByRole("listitem")).toHaveLength(6);
    expect(within(scoring).getByText("3–4 letters")).toBeInTheDocument();
    expect(within(scoring).getByText("9+ letters")).toBeInTheDocument();
  });

  test("loads one dictionary in Strict Mode and enables the board", async () => {
    const request = deferred<Set<string>>();
    const dictionaryLoader = vi.fn(() => request.promise);

    render(
      <StrictMode>
        <App dictionaryLoader={dictionaryLoader} />
      </StrictMode>,
    );

    expect(screen.getByText("Loading dictionary…")).toBeInTheDocument();
    expect(boardCells()).toHaveLength(36);
    expect(boardCells()[0]).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();

    await act(async () => {
      request.resolve(new Set(["cat"]));
      await request.promise;
    });

    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
    expect(dictionaryLoader).toHaveBeenCalledTimes(1);
    expect(boardCells()[0]).toBeEnabled();
    expect(screen.getByRole("button", { name: "Play again" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Try a new board" })).toBeNull();
  });

  test("retries a failed dictionary request", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const dictionaryLoader = vi
      .fn<() => Promise<Set<string>>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Set(["cat"]));
    const user = userEvent.setup();

    render(<App dictionaryLoader={dictionaryLoader} />);

    const retry = await screen.findByRole("button", {
      name: "Retry dictionary",
    });
    expect(screen.getByRole("group", { name: /garden board/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.click(retry);

    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
    expect(dictionaryLoader).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  test("submits a traced word and renders the updated round", async () => {
    await renderReady();
    const first = screen.getByRole("button", {
      name: "C, row 1, column 1",
    });
    const second = screen.getByRole("button", {
      name: "A, row 1, column 2",
    });
    const third = screen.getByRole("button", {
      name: "T, row 1, column 3",
    });
    traceCells(first, second, third);

    expect(screen.getByText("CAT · +1 point")).toBeInTheDocument();
    expect(screen.getByText("cat", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#score-value" })).toBeInTheDocument();
    expect(first).toBeDisabled();
    expect(second).toBeDisabled();
    expect(third).toBeDisabled();
  });

  test("accepts an inflected form omitted by the Webster dictionary", async () => {
    await renderReady(dictionaryFromArray(["caters"]));
    const cells = boardCells().slice(0, 6);

    traceCells(...cells);

    expect(screen.getByText("CATERS · +3 points")).toBeInTheDocument();
    expect(screen.getByText("caters", { selector: "li" })).toBeInTheDocument();
    for (const cell of cells) expect(cell).toBeDisabled();
  });

  test("rejects a short word without consuming its cells", async () => {
    await renderReady();
    const first = screen.getByRole("button", {
      name: "C, row 1, column 1",
    });
    const second = screen.getByRole("button", {
      name: "A, row 1, column 2",
    });

    traceCells(first, second);

    expect(screen.getByText("Words need at least three letters.")).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(first).toBeEnabled();
    expect(second).toBeEnabled();
  });

  test("restarts an active round while retaining its high score", async () => {
    const user = userEvent.setup();
    await renderReady();
    const first = screen.getByRole("button", {
      name: "C, row 1, column 1",
    });
    const second = screen.getByRole("button", {
      name: "A, row 1, column 2",
    });
    const third = screen.getByRole("button", {
      name: "T, row 1, column 3",
    });

    traceCells(first, second, third);
    const partial = screen.getByRole("button", {
      name: "D, row 2, column 1",
    });
    fireEvent.pointerDown(partial, { button: 0, pointerId: 11 });
    expect(screen.getByText("D", { selector: "output" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play again" }));

    expect(screen.getByRole("heading", { name: "garden board" })).toBeInTheDocument();
    expect(screen.getByText("1:00", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#high-score-value" })).toBeInTheDocument();
    expect(screen.getByText("—", { selector: "output" })).toBeInTheDocument();
    expect(screen.getByText("Your words will appear here.")).toBeInTheDocument();
    expect(first).toBeEnabled();
    expect(second).toBeEnabled();
    expect(third).toBeEnabled();
  });

  test("expires a round and can advance to the next board", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const request = deferred<Set<string>>();
    const dictionaryLoader = vi.fn(() => request.promise);

    render(<App dictionaryLoader={dictionaryLoader} />);
    await act(async () => {
      request.resolve(new Set(["cat"]));
      await request.promise;
    });

    expect(screen.getByText(READY_MESSAGE)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByText("Time’s up!")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /garden board/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Try a new board" }));

    expect(screen.getByRole("heading", { name: "seaside board" })).toBeInTheDocument();
    expect(screen.queryByText("Time’s up!")).toBeNull();
    expect(screen.getByRole("group", { name: /seaside board/ })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });
});
