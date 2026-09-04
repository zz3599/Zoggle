import generatedBoardData from "../assets/generated-boards.json";

import type { BoardDefinition } from "./types";

export const BOARD_SIZE = 6;
export const ROUND_SECONDS = 60;

function boardFromGeneratedRecord(
  value: unknown,
  index: number,
  idPrefix: string,
): BoardDefinition {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`Generated board ${index + 1} must be an object`);
  }

  const candidate = value as {
    readonly id?: unknown;
    readonly label?: unknown;
    readonly rows?: unknown;
  };
  if (
    typeof candidate.id !== "string" ||
    !candidate.id.startsWith(idPrefix) ||
    !/^[0-9a-f]{16}$/.test(candidate.id.slice(idPrefix.length))
  ) {
    throw new TypeError(`Generated board ${index + 1} must have an id`);
  }
  if (typeof candidate.label !== "string" || candidate.label.length === 0) {
    throw new TypeError(`Generated board ${index + 1} must have a label`);
  }
  if (
    !Array.isArray(candidate.rows) ||
    !candidate.rows.every((row): row is string => typeof row === "string")
  ) {
    throw new TypeError(`Generated board ${index + 1} must have string rows`);
  }

  return {
    id: candidate.id,
    label: candidate.label,
    letters: candidate.rows.map((row) => [...row]),
  };
}

const generatedEnvelope: unknown = generatedBoardData;
if (typeof generatedEnvelope !== "object" || generatedEnvelope === null) {
  throw new TypeError("Generated board data must be an object");
}

const generated = generatedEnvelope as {
  readonly boardCount?: unknown;
  readonly boards?: unknown;
  readonly formatVersion?: unknown;
  readonly generatorVersion?: unknown;
};
if (generated.formatVersion !== 1) {
  throw new TypeError("Unsupported generated board format version");
}
if (
  typeof generated.generatorVersion !== "string" ||
  !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(generated.generatorVersion)
) {
  throw new TypeError("Generated board data must have a generator version");
}

const generatedRecords = generated.boards;
if (!Array.isArray(generatedRecords) || generatedRecords.length === 0) {
  throw new TypeError("At least one generated board is required");
}
if (generated.boardCount !== generatedRecords.length) {
  throw new TypeError("Generated board count does not match its contents");
}

const generatedIdPrefix = `generated-${generated.generatorVersion}-`;
export const BOARDS: readonly BoardDefinition[] = generatedRecords.map(
  (record, index) => boardFromGeneratedRecord(record, index, generatedIdPrefix),
);

function validateBoards(boards: readonly BoardDefinition[]) {
  const ids = new Set<string>();
  const labels = new Set<string>();
  const layouts = new Set<string>();

  for (const candidate of boards) {
    if (candidate.id.length === 0) {
      throw new Error("Board ids must not be empty");
    }
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate board id: ${candidate.id}`);
    }

    ids.add(candidate.id);

    if (candidate.label !== undefined) {
      if (labels.has(candidate.label)) {
        throw new Error(`Duplicate board label: ${candidate.label}`);
      }
      labels.add(candidate.label);
    }

    const layout = candidate.letters.map((row) => row.join("")).join("");
    if (layouts.has(layout)) {
      throw new Error(`Duplicate board layout: ${candidate.id}`);
    }
    layouts.add(layout);

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
