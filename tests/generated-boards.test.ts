import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";

import {
  BOARD_GENERATOR_VERSION,
  DEFAULT_BOARD_POOL_SEED,
  DEFAULT_BOARD_QUALITY_THRESHOLDS,
  DEFAULT_BOARD_SEARCH_EVALUATIONS,
  DEFAULT_GENERATED_BOARD_COUNT,
  DEFAULT_LETTER_POOL,
  GENERATED_BOARD_SIZE,
  analyzeBoard,
  buildWordTrie,
  createBoardId,
} from "../src/board-generation";
import type { BoardMetrics } from "../src/board-generation";

const METRIC_NAMES = [
  "wordCount",
  "potentialScore",
  "longestWordLength",
  "longWordCount",
  "cellCoverage",
  "greedyDisjointWordCount",
] as const satisfies readonly (keyof BoardMetrics)[];

const THRESHOLD_NAMES = [
  "wordCount",
  "potentialScore",
  "longWordCount",
  "cellCoverage",
  "greedyDisjointWordCount",
] as const satisfies readonly (keyof BoardMetrics)[];

type QualityThresholds = Pick<
  BoardMetrics,
  (typeof THRESHOLD_NAMES)[number]
>;

const ACCEPTANCE_MINIMA: QualityThresholds = {
  wordCount: 1_200,
  potentialScore: 3_000,
  longWordCount: 100,
  cellCoverage: 36,
  greedyDisjointWordCount: 10,
};

interface ArtifactBoard {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly string[];
  readonly metrics: BoardMetrics;
}

interface GeneratedBoardsArtifact {
  readonly formatVersion: number;
  readonly generatorVersion: string;
  readonly seed: string | number;
  readonly boardCount: number;
  readonly evaluationsPerBoard: number;
  readonly letterPool: string;
  readonly qualityThresholds: QualityThresholds;
  readonly boards: readonly ArtifactBoard[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}

function isBoardMetrics(value: unknown): value is BoardMetrics {
  return (
    isRecord(value) &&
    METRIC_NAMES.every((name) => typeof value[name] === "number")
  );
}

function isQualityThresholds(value: unknown): value is QualityThresholds {
  return (
    isRecord(value) &&
    THRESHOLD_NAMES.every((name) => typeof value[name] === "number")
  );
}

function isArtifactBoard(value: unknown): value is ArtifactBoard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    isStringArray(value.rows) &&
    isBoardMetrics(value.metrics)
  );
}

function isGeneratedBoardsArtifact(
  value: unknown,
): value is GeneratedBoardsArtifact {
  return (
    isRecord(value) &&
    typeof value.formatVersion === "number" &&
    typeof value.generatorVersion === "string" &&
    (typeof value.seed === "string" || typeof value.seed === "number") &&
    typeof value.boardCount === "number" &&
    typeof value.evaluationsPerBoard === "number" &&
    typeof value.letterPool === "string" &&
    isQualityThresholds(value.qualityThresholds) &&
    Array.isArray(value.boards) &&
    value.boards.every(isArtifactBoard)
  );
}

const playableWordsValue = readJson("assets/playable-words.json");
if (!isStringArray(playableWordsValue)) {
  throw new TypeError("The playable-word artifact must be an array of strings.");
}

const generatedBoardsValue = readJson("assets/generated-boards.json");
if (!isGeneratedBoardsArtifact(generatedBoardsValue)) {
  throw new TypeError("The generated-board artifact has an invalid shape.");
}

const artifact = generatedBoardsValue;
const trie = buildWordTrie(playableWordsValue);

test(
  "generated boards re-solve to their recorded metrics and quality thresholds",
  () => {
    assert.equal(artifact.formatVersion, 1);
    assert.equal(artifact.generatorVersion, BOARD_GENERATOR_VERSION);
    assert.equal(artifact.seed, DEFAULT_BOARD_POOL_SEED);
    assert.equal(artifact.boardCount, DEFAULT_GENERATED_BOARD_COUNT);
    assert.equal(artifact.boardCount, artifact.boards.length);
    assert.ok(artifact.boardCount >= 8);
    assert.equal(
      artifact.evaluationsPerBoard,
      DEFAULT_BOARD_SEARCH_EVALUATIONS,
    );
    assert.equal(artifact.letterPool, DEFAULT_LETTER_POOL);
    assert.deepEqual(
      artifact.qualityThresholds,
      DEFAULT_BOARD_QUALITY_THRESHOLDS,
    );

    const boardIds = new Set<string>();
    const boardContents = new Set<string>();
    const labels = new Set<string>();
    const expectedPool = artifact.letterPool.split("").sort().join("");

    for (const board of artifact.boards) {
      assert.equal(board.rows.length, GENERATED_BOARD_SIZE, board.id);
      for (const row of board.rows) {
        assert.match(row, /^[A-Z]{6}$/, board.id);
      }

      const content = board.rows.join("");
      assert.equal(content.split("").sort().join(""), expectedPool, board.id);
      assert.equal(
        board.id,
        createBoardId(board.rows, artifact.generatorVersion),
        board.label,
      );

      assert.equal(boardIds.has(board.id), false, `duplicate id: ${board.id}`);
      assert.equal(
        boardContents.has(content),
        false,
        `duplicate board content: ${board.id}`,
      );
      assert.equal(
        labels.has(board.label),
        false,
        `duplicate label: ${board.label}`,
      );
      boardIds.add(board.id);
      boardContents.add(content);
      labels.add(board.label);

      const analysis = analyzeBoard(board.rows, trie);
      assert.deepEqual(analysis.metrics, board.metrics, board.id);

      const solvedWords = analysis.words.map(({ word }) => word);
      assert.equal(
        new Set(solvedWords).size,
        solvedWords.length,
        `${board.id} contains duplicate solved words`,
      );

      for (const metricName of THRESHOLD_NAMES) {
        assert.ok(
          analysis.metrics[metricName] >=
            artifact.qualityThresholds[metricName],
          `${board.id} misses ${metricName}: ${analysis.metrics[metricName]} < ${artifact.qualityThresholds[metricName]}`,
        );
      }

      assert.ok(analysis.metrics.wordCount >= ACCEPTANCE_MINIMA.wordCount);
      assert.ok(
        analysis.metrics.potentialScore >= ACCEPTANCE_MINIMA.potentialScore,
      );
      assert.ok(
        analysis.metrics.longWordCount >= ACCEPTANCE_MINIMA.longWordCount,
      );
      assert.equal(
        analysis.metrics.cellCoverage,
        ACCEPTANCE_MINIMA.cellCoverage,
      );
      assert.ok(
        analysis.metrics.greedyDisjointWordCount >=
          ACCEPTANCE_MINIMA.greedyDisjointWordCount,
      );
    }
  },
  30_000,
);
