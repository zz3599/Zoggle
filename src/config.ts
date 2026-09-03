import type { BoardDefinition } from "./types";

export const BOARD_SIZE = 6;
export const ROUND_SECONDS = 60;

const board = (id: string, rows: readonly string[]): BoardDefinition => ({
  id,
  letters: rows.map((row) => [...row]),
});

export const BOARDS = [
  board("garden", [
    "CATERS",
    "DOGING",
    "BIRDLY",
    "MOUSEN",
    "PLANTO",
    "STONER",
  ]),
  board("seaside", [
    "SEATRE",
    "WAVELP",
    "SHELLO",
    "CORALN",
    "TIDESD",
    "FISHER",
  ]),
  board("night", [
    "STARRY",
    "MOONED",
    "CLOUDS",
    "DREAMT",
    "QUIETL",
    "SLEEPY",
  ]),
];

function validateBoards(boards: readonly BoardDefinition[]) {
  const ids = new Set<string>();

  for (const candidate of boards) {
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate board id: ${candidate.id}`);
    }

    ids.add(candidate.id);

    if (
      candidate.letters.length !== BOARD_SIZE ||
      candidate.letters.some(
        (row) =>
          row.length !== BOARD_SIZE ||
          row.some((letter) => !/^[A-Z]$/.test(letter)),
      )
    ) {
      throw new Error(`Board ${candidate.id} must be ${BOARD_SIZE}x${BOARD_SIZE}`);
    }
  }
}

validateBoards(BOARDS);
