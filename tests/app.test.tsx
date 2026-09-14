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
import { createBoardId } from "../src/board-id";
import { dictionaryFromArray } from "../src/dictionary";
import type { FreshBoardGenerator } from "../src/fresh-board";
import type { BoardDefinition } from "../src/types";
import { setElementAtPoint } from "./setup";

const READY_MESSAGE = "Hold and drag across neighboring letters to make a word.";
const TEST_BOARDS: readonly BoardDefinition[] = [
  {
    id: "garden",
    letters: [
      [..."CATERS"],
      [..."DOGING"],
      [..."BIRDLY"],
      [..."MOUSEN"],
      [..."PLANTO"],
      [..."STONER"],
    ],
  },
  {
    id: "seaside",
    letters: [
      [..."SEATRE"],
      [..."WAVELP"],
      [..."SHELLO"],
      [..."CORALN"],
      [..."TIDESD"],
      [..."FISHER"],
    ],
  },
];

const FRESH_BOARD_ROWS = [
  "DOGERS",
  "BODING",
  "FIRMLY",
  "HOUSEA",
  "PLANET",
  "STOWED",
];
const FRESH_BOARD: BoardDefinition = {
  id: createBoardId(FRESH_BOARD_ROWS),
  label: "Fresh board",
  letters: FRESH_BOARD_ROWS.map((row) => [...row]),
};

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

function boardHeader(): HTMLElement {
  const boardName = screen.getByRole("heading", { name: /board$/ });
  const header = boardName.closest(".board-heading");
  if (!(header instanceof HTMLElement)) {
    throw new Error("The board name must be rendered in the board header");
  }
  return header;
}

function mockCellCenter(cell: HTMLElement): {
  readonly clientX: number;
  readonly clientY: number;
} {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const size = 10;
  const stride = 20;
  const left = col * stride;
  const top = row * stride;

  vi.spyOn(cell, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + size,
    bottom: top + size,
  } as DOMRect);

  return {
    clientX: left + size / 2,
    clientY: top + size / 2,
  };
}

function traceCells(...cells: HTMLElement[]): void {
  const first = cells[0];
  if (!first) throw new Error("At least one cell is required");

  const firstCenter = mockCellCenter(first);
  fireEvent.pointerDown(first, {
    button: 0,
    pointerId: 7,
    ...firstCenter,
  });

  for (const cell of cells.slice(1)) {
    const center = mockCellCenter(cell);
    setElementAtPoint(cell);
    fireEvent.pointerMove(document, {
      pointerId: 7,
      ...center,
    });
  }

  const last = cells.at(-1) ?? first;
  const lastCenter = mockCellCenter(last);
  setElementAtPoint(last);
  fireEvent.pointerUp(document, {
    pointerId: 7,
    ...lastCenter,
  });
}

async function renderReady(dictionary = new Set(["cat"])) {
  const dictionaryLoader = vi.fn(() => Promise.resolve(dictionary));
  const result = render(
    <StrictMode>
      <App boards={TEST_BOARDS} dictionaryLoader={dictionaryLoader} />
    </StrictMode>,
  );

  expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
  return { ...result, dictionaryLoader };
}

async function renderReadyWithFakeTimers(
  dictionary = new Set(["cat"]),
) {
  vi.useFakeTimers();
  const request = deferred<Set<string>>();
  const result = render(
    <App boards={TEST_BOARDS} dictionaryLoader={() => request.promise} />,
  );

  await act(async () => {
    request.resolve(dictionary);
    await request.promise;
  });

  expect(screen.getByText(READY_MESSAGE)).toBeInTheDocument();
  return result;
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
        <App boards={TEST_BOARDS} dictionaryLoader={dictionaryLoader} />
      </StrictMode>,
    );

    expect(screen.getByText("Loading dictionary…")).toBeInTheDocument();
    expect(screen.getByText("Game mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Classic/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Endless/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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

    render(<App boards={TEST_BOARDS} dictionaryLoader={dictionaryLoader} />);

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

  test("replaces the ready instruction with the live selection", async () => {
    await renderReady();
    const header = boardHeader();
    const first = screen.getByRole("button", {
      name: "C, row 1, column 1",
    });

    fireEvent.pointerDown(first, {
      button: 0,
      pointerId: 11,
      ...mockCellCenter(first),
    });

    expect(
      within(header).getByText("C", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(within(header).queryByText(READY_MESSAGE)).toBeNull();

    fireEvent.pointerCancel(document, { pointerId: 11 });
  });

  test("shows accepted word feedback in the board header for three seconds", async () => {
    await renderReadyWithFakeTimers();
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

    const header = boardHeader();
    expect(
      within(header).getByText("CAT", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".word-preview")).toBeNull();
    expect(screen.getByText("cat", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#score-value" })).toBeInTheDocument();
    expect(first).toBeDisabled();
    expect(second).toBeDisabled();
    expect(third).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(
      within(header).getByText("CAT", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      within(header).queryByText("CAT", { selector: "#current-word" }),
    ).toBeNull();
    expect(
      within(header).queryByText("+1 point", { selector: "#status" }),
    ).toBeNull();
  });

  test("accepts an inflected form omitted by the Webster dictionary", async () => {
    await renderReady(dictionaryFromArray(["caters"]));
    const cells = boardCells().slice(0, 6);

    traceCells(...cells);

    expect(
      screen.getByText("CATERS", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("+3 points", { selector: "#status" }),
    ).toBeInTheDocument();
    expect(screen.getByText("caters", { selector: "li" })).toBeInTheDocument();
    for (const cell of cells) expect(cell).toBeDisabled();
  });

  test("restarts the feedback timeout after a newer accepted word", async () => {
    await renderReadyWithFakeTimers(new Set(["cat", "dog"]));
    const cells = boardCells();

    traceCells(...cells.slice(0, 3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    traceCells(...cells.slice(6, 9));
    const header = boardHeader();
    expect(
      within(header).getByText("DOG", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(
      within(header).getByText("DOG", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(
      within(header).getByText("DOG", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      within(header).queryByText("DOG", { selector: "#current-word" }),
    ).toBeNull();
    expect(
      within(header).queryByText("+1 point", { selector: "#status" }),
    ).toBeNull();
  });

  test("clears accepted feedback when a new drag starts", async () => {
    await renderReadyWithFakeTimers();
    const cells = boardCells();

    traceCells(...cells.slice(0, 3));
    const header = boardHeader();
    expect(
      within(header).getByText("CAT", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(cells[6]!, {
      button: 0,
      pointerId: 11,
      ...mockCellCenter(cells[6]!),
    });

    expect(
      within(header).getByText("D", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      within(header).queryByText("CAT", { selector: "#current-word" }),
    ).toBeNull();
    expect(
      within(header).queryByText("+1 point", { selector: "#status" }),
    ).toBeNull();

    fireEvent.pointerCancel(document, { pointerId: 11 });
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

  test("switches visibly between Classic and Endless with separate rounds", async () => {
    const user = userEvent.setup();
    await renderReady();
    const endless = screen.getByRole("button", { name: /Endless/ });

    traceCells(...boardCells().slice(0, 3));
    expect(screen.getByText("1", { selector: "#score-value" })).toBeInTheDocument();

    await user.click(endless);

    expect(screen.getByRole("button", { name: /Classic/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /Endless/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#high-score-value" })).toBeInTheDocument();
    expect(screen.getByText("1:00", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C, row 1, column 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Endless/ })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /Classic/ }));

    expect(screen.getByRole("button", { name: /Classic/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Endless/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#high-score-value" })).toBeInTheDocument();
  });

  test("replenishes accepted Endless paths and lets their positions score again", async () => {
    const randomValues = [
      0.11714285714285713,
      0.5787878787878789,
      0.36666666666666664,
      0,
      0,
      0,
    ];
    const endlessTileRandom = vi.fn(() => randomValues.shift() ?? 0);
    const user = userEvent.setup();
    render(
      <App
        boards={TEST_BOARDS}
        dictionaryLoader={() => Promise.resolve(new Set(["cat", "dog"]))}
        endlessTileRandom={endlessTileRandom}
      />,
    );
    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Endless/ }));
    traceCells(...boardCells().slice(0, 3));

    expect(
      screen.getByText("CAT", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(screen.getByText("+1 point · 3 tiles refilled")).toBeInTheDocument();
    expect(endlessTileRandom).toHaveBeenCalledTimes(3);
    const dogCells = boardCells().slice(0, 3);
    expect(dogCells.map((cell) => cell.textContent)).toEqual(["D", "O", "G"]);
    for (const cell of dogCells) {
      expect(cell).toBeEnabled();
      expect(cell).toHaveClass("cell--replenished");
    }

    fireEvent.pointerDown(dogCells[0]!, {
      button: 0,
      pointerId: 12,
      ...mockCellCenter(dogCells[0]!),
    });
    expect(document.querySelector(".cell--replenished")).toBeNull();
    fireEvent.pointerCancel(document, { pointerId: 12 });

    traceCells(...dogCells);

    expect(
      screen.getByText("DOG", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("cat", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("dog", { selector: "li" })).toBeInTheDocument();
    expect(endlessTileRandom).toHaveBeenCalledTimes(6);
  });

  test("does not replenish a rejected Endless path and replay restores its seed board", async () => {
    const endlessTileRandom = vi.fn(() => 0);
    const user = userEvent.setup();
    render(
      <App
        boards={TEST_BOARDS}
        dictionaryLoader={() => Promise.resolve(new Set(["cat"]))}
        endlessTileRandom={endlessTileRandom}
      />,
    );
    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Endless/ }));

    traceCells(...boardCells().slice(0, 2));
    expect(screen.getByText("Words need at least three letters.")).toBeInTheDocument();
    expect(boardCells().slice(0, 3).map((cell) => cell.textContent)).toEqual([
      "C",
      "A",
      "T",
    ]);
    expect(endlessTileRandom).not.toHaveBeenCalled();

    traceCells(...boardCells().slice(0, 3));
    expect(boardCells().slice(0, 3).map((cell) => cell.textContent)).not.toEqual([
      "C",
      "A",
      "T",
    ]);
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(boardCells().slice(0, 3).map((cell) => cell.textContent)).toEqual([
      "C",
      "A",
      "T",
    ]);
    for (const cell of boardCells().slice(0, 3)) expect(cell).toBeEnabled();
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
    expect(
      screen.getByText("CAT", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play again" }));

    expect(screen.getByRole("heading", { name: "garden board" })).toBeInTheDocument();
    expect(screen.getByText("1:00", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#high-score-value" })).toBeInTheDocument();
    expect(screen.queryByText("CAT", { selector: "#current-word" })).toBeNull();
    expect(screen.queryByText("+1 point", { selector: "#status" })).toBeNull();
    expect(screen.getByText("Your words will appear here.")).toBeInTheDocument();
    expect(first).toBeEnabled();
    expect(second).toBeEnabled();
    expect(third).toBeEnabled();
  });

  test("generates a fresh board and starts a clean round on it", async () => {
    const dictionary = new Set(["cat", "dog"]);
    const request = deferred<BoardDefinition>();
    const freshBoardGenerator = vi.fn<FreshBoardGenerator>(
      () => request.promise,
    );
    const user = userEvent.setup();

    render(
      <App
        boards={TEST_BOARDS}
        dictionaryLoader={() => Promise.resolve(dictionary)}
        freshBoardGenerator={freshBoardGenerator}
      />,
    );
    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();

    traceCells(...boardCells().slice(0, 3));
    expect(screen.getByText("1", { selector: "#score-value" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Generate fresh board" }),
    );

    expect(freshBoardGenerator).toHaveBeenCalledTimes(1);
    expect(freshBoardGenerator.mock.calls[0]?.[0]).toBe(dictionary);
    expect(freshBoardGenerator.mock.calls[0]?.[1]?.excludedBoardIds).toEqual([
      "garden",
      "seaside",
    ]);
    expect(freshBoardGenerator.mock.calls[0]?.[1]?.signal).toBeInstanceOf(
      AbortSignal,
    );
    expect(screen.getByText("Searching for a fresh board…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel generation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Play again" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "garden board" })).toBeInTheDocument();

    await act(async () => {
      request.resolve(FRESH_BOARD);
      await request.promise;
    });

    expect(screen.getByRole("heading", { name: "Fresh board" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#high-score-value" })).toBeInTheDocument();
    expect(screen.getByText("1:00", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.getByText("Your words will appear here.")).toBeInTheDocument();
    expect(screen.getByText("Fresh board ready.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate fresh board" }),
    ).toBeEnabled();

    traceCells(...boardCells().slice(0, 3));
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByRole("heading", { name: "Fresh board" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#high-score-value" })).toBeInTheDocument();
  });

  test("can cancel generation without changing the current round", async () => {
    const request = deferred<BoardDefinition>();
    const freshBoardGenerator = vi.fn<FreshBoardGenerator>(
      () => request.promise,
    );
    const user = userEvent.setup();

    render(
      <App
        boards={TEST_BOARDS}
        dictionaryLoader={() => Promise.resolve(new Set(["cat"]))}
        freshBoardGenerator={freshBoardGenerator}
      />,
    );
    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
    traceCells(...boardCells().slice(0, 3));

    await user.click(
      screen.getByRole("button", { name: "Generate fresh board" }),
    );
    const signal = freshBoardGenerator.mock.calls[0]?.[1]?.signal;
    await user.click(screen.getByRole("button", { name: "Cancel generation" }));

    expect(signal?.aborted).toBe(true);
    expect(
      screen.getByText("Fresh-board generation cancelled."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "garden board" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "#score-value" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate fresh board" }),
    ).toBeEnabled();

    await act(async () => {
      request.resolve(FRESH_BOARD);
      await request.promise;
    });
    expect(screen.getByRole("heading", { name: "garden board" })).toBeInTheDocument();
  });

  test("keeps the current round when fresh-board generation fails", async () => {
    const freshBoardGenerator = vi.fn(() =>
      Promise.reject(new Error("worker failed")),
    );
    const user = userEvent.setup();

    render(
      <App
        boards={TEST_BOARDS}
        dictionaryLoader={() => Promise.resolve(new Set(["cat"]))}
        freshBoardGenerator={freshBoardGenerator}
      />,
    );
    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Generate fresh board" }),
    );

    expect(
      await screen.findByText("Couldn’t generate a fresh board. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "garden board" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate fresh board" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(
      screen.queryByText("Couldn’t generate a fresh board. Try again."),
    ).toBeNull();
  });

  test("starts a fresh session when the supplied board collection changes", async () => {
    const dictionaryLoader = vi.fn(() => Promise.resolve(new Set(["cat"])));
    const { rerender } = render(
      <App boards={TEST_BOARDS} dictionaryLoader={dictionaryLoader} />,
    );

    expect(await screen.findByText(READY_MESSAGE)).toBeInTheDocument();
    traceCells(...boardCells().slice(0, 3));
    expect(screen.getByText("1", { selector: "#score-value" })).toBeInTheDocument();

    rerender(
      <App boards={[TEST_BOARDS[1]!]} dictionaryLoader={dictionaryLoader} />,
    );

    expect(screen.getByRole("heading", { name: "seaside board" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "#score-value" })).toBeInTheDocument();
    expect(screen.getByText("1:00", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.getByText("Your words will appear here.")).toBeInTheDocument();
  });

  test("expires a round and can advance to the next board", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const request = deferred<Set<string>>();
    const dictionaryLoader = vi.fn(() => request.promise);

    render(<App boards={TEST_BOARDS} dictionaryLoader={dictionaryLoader} />);
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

  test("keeps the round-complete status when feedback expires with the round", async () => {
    await renderReadyWithFakeTimers();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(57_000);
    });
    expect(screen.getByText("0:03", { selector: "#timer-value" })).toBeInTheDocument();

    traceCells(...boardCells().slice(0, 3));
    expect(
      screen.getByText("CAT", { selector: "#current-word" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("+1 point", { selector: "#status" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.getByText("Time’s up!")).toBeInTheDocument();
    expect(
      screen.getByText("Round complete — 1 point.", { selector: "#status" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CAT", { selector: "#current-word" })).toBeNull();
    expect(screen.queryByText("+1 point", { selector: "#status" })).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(
      screen.getByText("Round complete — 1 point.", { selector: "#status" }),
    ).toBeInTheDocument();
  });

  test("pauses while the page is unfocused and resumes when focus returns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const request = deferred<Set<string>>();

    render(
      <StrictMode>
        <App boards={TEST_BOARDS} dictionaryLoader={() => request.promise} />
      </StrictMode>,
    );
    await act(async () => {
      request.resolve(new Set(["cat"]));
      await request.promise;
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText("0:50", { selector: "#timer-value" })).toBeInTheDocument();

    fireEvent.blur(window);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });

    expect(screen.getByText("0:50", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.queryByText("Time’s up!")).toBeNull();

    fireEvent.focus(window);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(49_900);
    });
    expect(screen.getByText("0:01", { selector: "#timer-value" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Time’s up!")).toBeInTheDocument();
  });

  test("starts paused if focus is lost while the dictionary loads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const request = deferred<Set<string>>();

    render(
      <App boards={TEST_BOARDS} dictionaryLoader={() => request.promise} />,
    );
    fireEvent.blur(window);
    await act(async () => {
      request.resolve(new Set(["cat"]));
      await request.promise;
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });
    expect(screen.getByText("1:00", { selector: "#timer-value" })).toBeInTheDocument();
    expect(screen.queryByText("Time’s up!")).toBeNull();

    fireEvent.focus(window);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText("0:59", { selector: "#timer-value" })).toBeInTheDocument();
  });
});
