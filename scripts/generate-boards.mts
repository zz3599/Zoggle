import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOARD_GENERATOR_VERSION,
  DEFAULT_BOARD_POOL_SEED,
  DEFAULT_BOARD_QUALITY_THRESHOLDS,
  DEFAULT_BOARD_SEARCH_EVALUATIONS,
  DEFAULT_LETTER_POOL,
  DEFAULT_GENERATED_BOARD_COUNT,
  buildWordTrie,
  generateBoard,
  type BoardMetrics,
} from "../src/board-generation.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const dictionaryPath = resolve(projectRoot, "assets/playable-words.json");
const defaultOutputPath = resolve(projectRoot, "assets/generated-boards.json");

interface CommandOptions {
  readonly boardCount: number;
  readonly evaluations: number;
  readonly outputPath: string;
  readonly seed: string;
}

interface GeneratedBoardRecord {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly string[];
  readonly metrics: BoardMetrics;
}

function usage(): string {
  return [
    "Generate a deterministic, quality-gated pool of Zoggle boards.",
    "",
    "Usage: npm run generate:boards -- [options]",
    "",
    `  --seed <value>         Master seed (default: ${DEFAULT_BOARD_POOL_SEED})`,
    `  --count <integer>      Number of boards (default: ${DEFAULT_GENERATED_BOARD_COUNT})`,
    `  --evaluations <number> Solved candidates per board (default: ${DEFAULT_BOARD_SEARCH_EVALUATIONS})`,
    "  --output <path>        Output JSON path (default: assets/generated-boards.json)",
    "  --help                 Show this message",
  ].join("\n");
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`${option} must be a positive integer.`);
  }
  return parsed;
}

function parseArguments(arguments_: readonly string[]): CommandOptions | null {
  let boardCount = DEFAULT_GENERATED_BOARD_COUNT;
  let evaluations = DEFAULT_BOARD_SEARCH_EVALUATIONS;
  let outputPath = defaultOutputPath;
  let seed = DEFAULT_BOARD_POOL_SEED;

  for (let index = 0; index < arguments_.length; index += 1) {
    const option = arguments_[index];
    if (option === "--help") return null;

    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${String(option)}.`);
    }
    index += 1;

    switch (option) {
      case "--seed":
        seed = value;
        break;
      case "--count":
        boardCount = positiveInteger(value, option);
        break;
      case "--evaluations":
        evaluations = positiveInteger(value, option);
        break;
      case "--output":
        outputPath = resolve(value);
        break;
      default:
        throw new TypeError(`Unknown option: ${String(option)}`);
    }
  }

  return { boardCount, evaluations, outputPath, seed };
}

function missesQualityThreshold(metrics: BoardMetrics): string | null {
  for (const [metric, minimum] of Object.entries(
    DEFAULT_BOARD_QUALITY_THRESHOLDS,
  )) {
    const actual = metrics[metric as keyof BoardMetrics];
    if (actual < minimum) {
      return `${metric} is ${actual}; expected at least ${minimum}`;
    }
  }
  return null;
}

const options = parseArguments(process.argv.slice(2));
if (options === null) {
  console.log(usage());
} else {
  const dictionaryData: unknown = JSON.parse(
    await readFile(dictionaryPath, "utf8"),
  );
  if (
    !Array.isArray(dictionaryData) ||
    !dictionaryData.every((word): word is string => typeof word === "string")
  ) {
    throw new TypeError("The playable dictionary must be an array of strings.");
  }

  const trie = buildWordTrie(dictionaryData);
  const boards: GeneratedBoardRecord[] = [];
  const ids = new Set<string>();
  const layouts = new Set<string>();

  for (let index = 0; index < options.boardCount; index += 1) {
    const boardSeed = `${options.seed}:${index + 1}`;
    const generated = generateBoard(trie, {
      seed: boardSeed,
      evaluations: options.evaluations,
      minimumMetrics: DEFAULT_BOARD_QUALITY_THRESHOLDS,
    });
    const qualityFailure = missesQualityThreshold(generated.metrics);
    if (qualityFailure !== null) {
      throw new Error(
        `Generated board ${index + 1} failed its quality gate: ${qualityFailure}. ` +
          "Increase --evaluations or choose another --seed.",
      );
    }

    const layout = generated.rows.join("");
    if (ids.has(generated.id) || layouts.has(layout)) {
      throw new Error(`Generated board ${index + 1} duplicates an earlier board.`);
    }
    ids.add(generated.id);
    layouts.add(layout);

    boards.push({
      id: generated.id,
      label: `Generated board ${index + 1}`,
      rows: generated.rows,
      metrics: generated.metrics,
    });

    console.log(
      `${index + 1}/${options.boardCount} ${generated.id}: ` +
        `${generated.metrics.wordCount.toLocaleString()} words, ` +
        `${generated.metrics.potentialScore.toLocaleString()} independent-word points`,
    );
  }

  const artifact = {
    formatVersion: 1,
    generatorVersion: BOARD_GENERATOR_VERSION,
    seed: options.seed,
    boardCount: options.boardCount,
    evaluationsPerBoard: options.evaluations,
    letterPool: DEFAULT_LETTER_POOL,
    qualityThresholds: DEFAULT_BOARD_QUALITY_THRESHOLDS,
    boards,
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

  await writeFile(options.outputPath, serialized);
  console.log(`Wrote ${boards.length} boards to ${options.outputPath}`);
}
