import { scoreWord } from "./rules.ts";
import type { Coordinate, LetterGrid } from "./types.ts";

export const GENERATED_BOARD_SIZE = 6;
export const LONG_WORD_MIN_LENGTH = 7;
export const BOARD_GENERATOR_VERSION = "v1";

/**
 * A 36-tile approximation of English letter frequency. Board search only
 * changes the positions of these letters, never the multiset itself.
 */
export const DEFAULT_LETTER_POOL = "AAABCDDEEEEFGHHIIILMNNOOOPRRSSTTTUWY";

const LOWERCASE_WORD = /^[a-z]{3,}$/;
const ASCII_LETTER = /^[A-Za-z]$/;
const UPPERCASE_LETTER = /^[A-Z]$/;
const UINT32_RANGE = 0x1_0000_0000;

interface MutableTrieNode {
  readonly children: Map<number, number>;
  word: string | null;
}

interface TrieData {
  readonly nodes: readonly MutableTrieNode[];
}

/** An immutable handle to a reusable dictionary prefix index. */
export interface WordTrie {
  readonly wordCount: number;
  readonly maxWordLength: number;
}

const trieDataByHandle = new WeakMap<WordTrie, TrieData>();

export interface TraceableWord {
  readonly word: string;
  /** The first path found by a row-major, deterministic DFS. */
  readonly path: readonly Coordinate[];
  /** A bit per row-major cell in `path`; supports boards larger than 32 cells. */
  readonly pathMask: bigint;
}

export interface BoardMetrics {
  /** Number of unique playable words on the board. */
  readonly wordCount: number;
  /** Sum of the normal game score for every unique playable word. */
  readonly potentialScore: number;
  readonly longestWordLength: number;
  /** Number of unique words at least `LONG_WORD_MIN_LENGTH` letters long. */
  readonly longWordCount: number;
  /** Number of cells participating in at least one successful trace. */
  readonly cellCoverage: number;
  /** Deterministic greedy packing of representative, tile-disjoint paths. */
  readonly greedyDisjointWordCount: number;
}

export type BoardQualityThresholds = Readonly<Partial<BoardMetrics>>;

export const DEFAULT_BOARD_POOL_SEED = "zoggle-board-pool-2026-09-04";
export const DEFAULT_GENERATED_BOARD_COUNT = 8;
export const DEFAULT_BOARD_SEARCH_EVALUATIONS = 1_200;
export const DEFAULT_BOARD_QUALITY_THRESHOLDS = Object.freeze({
  wordCount: 1_200,
  potentialScore: 3_000,
  longWordCount: 100,
  cellCoverage: GENERATED_BOARD_SIZE * GENERATED_BOARD_SIZE,
  greedyDisjointWordCount: 10,
}) satisfies BoardQualityThresholds;

export interface BoardAnalysis {
  readonly words: readonly TraceableWord[];
  readonly metrics: BoardMetrics;
}

export type BoardInput = LetterGrid | readonly string[];
export type RandomSeed = number | string;

export interface BoardSearchOptions {
  readonly seed: RandomSeed;
  /** Exact number of candidate boards to solve, including the initial board. */
  readonly evaluations: number;
  readonly letterPool?: string | readonly string[];
  readonly initialTemperature?: number;
  readonly finalTemperature?: number;
  readonly generatorVersion?: string;
  /** Prefer the best candidate satisfying every supplied quality floor. */
  readonly minimumMetrics?: BoardQualityThresholds;
}

export interface GenerateBoardOptions extends BoardSearchOptions {
  readonly trie: WordTrie;
}

export interface GeneratedBoard {
  readonly id: string;
  readonly rows: readonly string[];
  readonly letters: LetterGrid;
  readonly metrics: BoardMetrics;
  readonly seed: RandomSeed;
  readonly evaluations: number;
  readonly generatorVersion: string;
}

interface NormalizedBoard {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly letters: readonly number[];
}

interface SolverResult {
  readonly words: readonly TraceableWord[];
  readonly cellCoverage: number;
  readonly threeLetterPaths: readonly DisjointPathCandidate[];
}

interface DisjointPathCandidate {
  readonly word: string;
  readonly path: readonly number[];
  readonly pathMask: bigint;
}

function compareStrings(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return false;
  }

  return typeof (value as { readonly [Symbol.iterator]?: unknown })[
    Symbol.iterator
  ] === "function";
}

/** Build a dictionary trie once and reuse it for every board evaluation. */
export function buildWordTrie(words: Iterable<string>): WordTrie {
  if (!isIterable(words)) {
    throw new TypeError("Dictionary words must be an iterable of strings.");
  }

  const nodes: MutableTrieNode[] = [
    { children: new Map<number, number>(), word: null },
  ];
  let wordCount = 0;
  let maxWordLength = 0;

  for (const candidate of words) {
    if (typeof candidate !== "string" || !LOWERCASE_WORD.test(candidate)) {
      throw new TypeError(
        `Dictionary words must contain only lowercase ASCII letters and be at least 3 letters long: ${String(candidate)}`,
      );
    }

    let nodeIndex = 0;

    for (let index = 0; index < candidate.length; index += 1) {
      const letterCode = candidate.charCodeAt(index) - 97;
      const node = nodes[nodeIndex];
      if (node === undefined) {
        throw new Error("Dictionary trie is internally inconsistent.");
      }

      let childIndex = node.children.get(letterCode);
      if (childIndex === undefined) {
        childIndex = nodes.length;
        node.children.set(letterCode, childIndex);
        nodes.push({ children: new Map<number, number>(), word: null });
      }

      nodeIndex = childIndex;
    }

    const terminalNode = nodes[nodeIndex];
    if (terminalNode === undefined) {
      throw new Error("Dictionary trie is internally inconsistent.");
    }

    if (terminalNode.word === null) {
      terminalNode.word = candidate;
      wordCount += 1;
      maxWordLength = Math.max(maxWordLength, candidate.length);
    }
  }

  const handle: WordTrie = Object.freeze({ wordCount, maxWordLength });
  trieDataByHandle.set(handle, { nodes });
  return handle;
}

/** Concise alias for callers that already establish the dictionary context. */
export const buildTrie = buildWordTrie;

function requireTrie(trie: WordTrie): TrieData {
  if (
    typeof trie !== "object" ||
    trie === null ||
    !trieDataByHandle.has(trie)
  ) {
    throw new TypeError("Expected a trie returned by buildWordTrie().");
  }

  const data = trieDataByHandle.get(trie);
  if (data === undefined) {
    throw new TypeError("Expected a trie returned by buildWordTrie().");
  }
  return data;
}

function normalizeBoard(board: BoardInput): NormalizedBoard {
  if (!Array.isArray(board) || board.length === 0) {
    throw new RangeError("A board must contain at least one row.");
  }

  const firstRow: unknown = board[0];
  const rowsAreStrings = typeof firstRow === "string";
  const columnCount = rowsAreStrings
    ? firstRow.length
    : Array.isArray(firstRow)
      ? firstRow.length
      : 0;

  if (columnCount === 0) {
    throw new RangeError("A board must contain at least one column.");
  }

  const letters: number[] = [];

  for (const row of board as readonly unknown[]) {
    if (rowsAreStrings ? typeof row !== "string" : !Array.isArray(row)) {
      throw new TypeError("Every board row must use the same representation.");
    }

    const cells: readonly unknown[] =
      typeof row === "string" ? [...row] : (row as readonly unknown[]);

    if (cells.length !== columnCount) {
      throw new RangeError("Board rows must all have the same length.");
    }

    for (const cell of cells) {
      if (typeof cell !== "string" || !ASCII_LETTER.test(cell)) {
        throw new TypeError(
          "Every board cell must contain one ASCII letter (A-Z).",
        );
      }
      letters.push(cell.toLowerCase().charCodeAt(0) - 97);
    }
  }

  return {
    rowCount: board.length,
    columnCount,
    letters,
  };
}

function createNeighborIndex(
  rowCount: number,
  columnCount: number,
): readonly (readonly number[])[] {
  const neighbors: number[][] = Array.from(
    { length: rowCount * columnCount },
    () => [],
  );

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const cellIndex = row * columnCount + column;
      const cellNeighbors = neighbors[cellIndex];
      if (cellNeighbors === undefined) continue;

      const firstRow = Math.max(0, row - 1);
      const lastRow = Math.min(rowCount - 1, row + 1);
      const firstColumn = Math.max(0, column - 1);
      const lastColumn = Math.min(columnCount - 1, column + 1);

      for (let neighborRow = firstRow; neighborRow <= lastRow; neighborRow += 1) {
        for (
          let neighborColumn = firstColumn;
          neighborColumn <= lastColumn;
          neighborColumn += 1
        ) {
          if (neighborRow !== row || neighborColumn !== column) {
            cellNeighbors.push(neighborRow * columnCount + neighborColumn);
          }
        }
      }
    }
  }

  return neighbors;
}

function pathToMask(path: readonly number[]): bigint {
  let mask = 0n;
  for (const cellIndex of path) {
    mask |= 1n << BigInt(cellIndex);
  }
  return mask;
}

function pathToCoordinates(
  path: readonly number[],
  columnCount: number,
): readonly Coordinate[] {
  return path.map((cellIndex) => ({
    row: Math.floor(cellIndex / columnCount),
    col: cellIndex % columnCount,
  }));
}

function solveNormalizedBoard(
  board: NormalizedBoard,
  trie: WordTrie,
): SolverResult {
  const { nodes } = requireTrie(trie);
  const cellCount = board.letters.length;

  if (cellCount === 0 || trie.wordCount === 0) {
    return { words: [], cellCoverage: 0, threeLetterPaths: [] };
  }

  const neighbors = createNeighborIndex(board.rowCount, board.columnCount);
  const visited = new Uint8Array(cellCount);
  const covered = new Uint8Array(cellCount);
  const path: number[] = [];
  const foundWords = new Map<string, TraceableWord>();
  const threeLetterMasksByWord = new Map<string, Set<bigint>>();
  const threeLetterPaths: DisjointPathCandidate[] = [];

  const visit = (cellIndex: number, nodeIndex: number): void => {
    visited[cellIndex] = 1;
    path.push(cellIndex);

    const node = nodes[nodeIndex];
    if (node === undefined) {
      throw new Error("Dictionary trie is internally inconsistent.");
    }

    if (node.word !== null) {
      for (const usedCell of path) {
        covered[usedCell] = 1;
      }

      const existingWord = foundWords.has(node.word);
      const recordsThreeLetterPath = path.length === 3;

      if (!existingWord || recordsThreeLetterPath) {
        const pathMask = pathToMask(path);

        if (!existingWord) {
          foundWords.set(node.word, {
            word: node.word,
            path: pathToCoordinates(path, board.columnCount),
            pathMask,
          });
        }

        if (recordsThreeLetterPath) {
          let masks = threeLetterMasksByWord.get(node.word);
          if (masks === undefined) {
            masks = new Set<bigint>();
            threeLetterMasksByWord.set(node.word, masks);
          }
          if (!masks.has(pathMask)) {
            masks.add(pathMask);
            threeLetterPaths.push({
              word: node.word,
              path: [...path],
              pathMask,
            });
          }
        }
      }
    }

    if (path.length < trie.maxWordLength) {
      const cellNeighbors = neighbors[cellIndex];
      if (cellNeighbors !== undefined) {
        for (const neighborIndex of cellNeighbors) {
          if (visited[neighborIndex] !== 0) continue;

          const letterCode = board.letters[neighborIndex];
          if (letterCode === undefined) continue;
          const childIndex = node.children.get(letterCode);
          if (childIndex !== undefined) {
            visit(neighborIndex, childIndex);
          }
        }
      }
    }

    path.pop();
    visited[cellIndex] = 0;
  };

  const root = nodes[0];
  if (root === undefined) {
    throw new Error("Dictionary trie is internally inconsistent.");
  }

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const letterCode = board.letters[cellIndex];
    if (letterCode === undefined) continue;
    const childIndex = root.children.get(letterCode);
    if (childIndex !== undefined) {
      visit(cellIndex, childIndex);
    }
  }

  const words = [...foundWords.values()].sort((first, second) =>
    compareStrings(first.word, second.word),
  );
  let cellCoverage = 0;
  for (const isCovered of covered) {
    cellCoverage += isCovered;
  }

  return { words, cellCoverage, threeLetterPaths };
}

/** Find every unique dictionary word traceable on a rectangular board. */
export function solveBoard(
  board: BoardInput,
  trie: WordTrie,
): readonly TraceableWord[] {
  return solveNormalizedBoard(normalizeBoard(board), trie).words;
}

function countGreedyDisjointWords(result: SolverResult): number {
  let claimedCells = 0n;
  let count = 0;
  const claimedWords = new Set<string>();

  while (true) {
    const viable = result.threeLetterPaths.filter(
      (candidate) =>
        !claimedWords.has(candidate.word) &&
        (candidate.pathMask & claimedCells) === 0n,
    );
    if (viable.length === 0) break;

    const cellFrequencies = new Map<number, number>();
    const wordFrequencies = new Map<string, number>();
    for (const candidate of viable) {
      wordFrequencies.set(
        candidate.word,
        (wordFrequencies.get(candidate.word) ?? 0) + 1,
      );
      for (const cellIndex of candidate.path) {
        cellFrequencies.set(
          cellIndex,
          (cellFrequencies.get(cellIndex) ?? 0) + 1,
        );
      }
    }

    let selected: DisjointPathCandidate | undefined;
    let selectedCellFrequency = Number.POSITIVE_INFINITY;
    let selectedWordFrequency = Number.POSITIVE_INFINITY;

    for (const candidate of viable) {
      let cellFrequency = 0;
      for (const cellIndex of candidate.path) {
        cellFrequency += cellFrequencies.get(cellIndex) ?? 0;
      }
      const wordFrequency = wordFrequencies.get(candidate.word) ?? 0;

      if (
        selected === undefined ||
        cellFrequency < selectedCellFrequency ||
        (cellFrequency === selectedCellFrequency &&
          (wordFrequency < selectedWordFrequency ||
            (wordFrequency === selectedWordFrequency &&
              (compareStrings(candidate.word, selected.word) < 0 ||
                (candidate.word === selected.word &&
                  candidate.pathMask < selected.pathMask)))))
      ) {
        selected = candidate;
        selectedCellFrequency = cellFrequency;
        selectedWordFrequency = wordFrequency;
      }
    }

    if (selected === undefined) break;
    claimedCells |= selected.pathMask;
    claimedWords.add(selected.word);
    count += 1;
  }

  const longerCandidates = result.words
    .filter((candidate) => candidate.word.length > 3)
    .sort((first, second) => {
      const lengthDifference = first.word.length - second.word.length;
      return lengthDifference !== 0
        ? lengthDifference
        : compareStrings(first.word, second.word);
    });

  for (const candidate of longerCandidates) {
    if ((candidate.pathMask & claimedCells) === 0n) {
      claimedCells |= candidate.pathMask;
      count += 1;
    }
  }

  return count;
}

function metricsFromSolverResult(result: SolverResult): BoardMetrics {
  let potentialScore = 0;
  let longestWordLength = 0;
  let longWordCount = 0;

  for (const { word } of result.words) {
    potentialScore += scoreWord(word);
    longestWordLength = Math.max(longestWordLength, word.length);
    if (word.length >= LONG_WORD_MIN_LENGTH) {
      longWordCount += 1;
    }
  }

  return {
    wordCount: result.words.length,
    potentialScore,
    longestWordLength,
    longWordCount,
    cellCoverage: result.cellCoverage,
    greedyDisjointWordCount: countGreedyDisjointWords(result),
  };
}

/** Solve a board and calculate all generation-quality metrics in one pass. */
export function analyzeBoard(
  board: BoardInput,
  trie: WordTrie,
): BoardAnalysis {
  const result = solveNormalizedBoard(normalizeBoard(board), trie);
  return {
    words: result.words,
    metrics: metricsFromSolverResult(result),
  };
}

/** Calculate board metrics without retaining the analysis wrapper. */
export function measureBoard(
  board: BoardInput,
  trie: WordTrie,
): BoardMetrics {
  return analyzeBoard(board, trie).metrics;
}

function seedToUint32(seed: RandomSeed): number {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) {
      throw new TypeError("A numeric random seed must be a safe integer.");
    }
  } else if (typeof seed !== "string") {
    throw new TypeError("A random seed must be a string or safe integer.");
  }

  const source = `${typeof seed}:${String(seed)}`;
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** Return a deterministic Mulberry32 random source in the half-open range [0, 1). */
export function createSeededRandom(seed: RandomSeed): () => number {
  let state = seedToUint32(seed);

  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function normalizeLetterPool(
  pool: string | readonly string[],
): readonly string[] {
  if (typeof pool !== "string" && !Array.isArray(pool)) {
    throw new TypeError("A generation letter pool must be a string or array.");
  }

  const letters: readonly string[] = typeof pool === "string" ? [...pool] : pool;
  const expectedCellCount = GENERATED_BOARD_SIZE * GENERATED_BOARD_SIZE;

  if (letters.length !== expectedCellCount) {
    throw new RangeError(
      `A generation letter pool must contain exactly ${expectedCellCount} letters.`,
    );
  }

  return letters.map((letter) => {
    if (typeof letter !== "string" || !ASCII_LETTER.test(letter)) {
      throw new TypeError(
        "A generation letter pool may contain only single ASCII letters.",
      );
    }
    return letter.toUpperCase();
  });
}

function shuffleLetters(
  letters: readonly string[],
  random: () => number,
): string[] {
  const shuffled = [...letters];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    const temporary = shuffled[index];
    const other = shuffled[otherIndex];
    if (temporary === undefined || other === undefined) {
      throw new Error("Letter shuffle selected an invalid cell.");
    }
    shuffled[index] = other;
    shuffled[otherIndex] = temporary;
  }

  return shuffled;
}

function rowsFromLetters(letters: readonly string[]): readonly string[] {
  const rows: string[] = [];
  for (let offset = 0; offset < letters.length; offset += GENERATED_BOARD_SIZE) {
    rows.push(letters.slice(offset, offset + GENERATED_BOARD_SIZE).join(""));
  }
  return rows;
}

function validateGeneratedRows(rows: readonly string[]): void {
  if (!Array.isArray(rows)) {
    throw new TypeError("Generated board rows must be an array of strings.");
  }

  if (
    rows.length !== GENERATED_BOARD_SIZE ||
    rows.some(
      (row) =>
        typeof row !== "string" ||
        row.length !== GENERATED_BOARD_SIZE ||
        [...row].some((letter) => !UPPERCASE_LETTER.test(letter)),
    )
  ) {
    throw new RangeError(
      `Generated board rows must form a ${GENERATED_BOARD_SIZE}x${GENERATED_BOARD_SIZE} uppercase grid.`,
    );
  }
}

function hashContent(source: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}

function assertGeneratorVersion(generatorVersion: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(generatorVersion)) {
    throw new TypeError(
      "A generator version must be a non-empty identifier containing letters, digits, dots, underscores, or hyphens.",
    );
  }
}

/** Derive an ID solely from the generator version and uppercase board content. */
export function createBoardId(
  rows: readonly string[],
  generatorVersion = BOARD_GENERATOR_VERSION,
): string {
  validateGeneratedRows(rows);
  assertGeneratorVersion(generatorVersion);

  return `generated-${generatorVersion}-${hashContent(`${generatorVersion}:${rows.join("")}`)}`;
}

/** Compare metrics in the same lexicographic order used to retain the best board. */
export function compareBoardMetrics(
  first: BoardMetrics,
  second: BoardMetrics,
): number {
  const firstValues = [
    first.wordCount,
    first.potentialScore,
    first.longWordCount,
    first.longestWordLength,
    first.cellCoverage,
    first.greedyDisjointWordCount,
  ];
  const secondValues = [
    second.wordCount,
    second.potentialScore,
    second.longWordCount,
    second.longestWordLength,
    second.cellCoverage,
    second.greedyDisjointWordCount,
  ];

  for (let index = 0; index < firstValues.length; index += 1) {
    const difference = (firstValues[index] ?? 0) - (secondValues[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

const BOARD_METRIC_NAMES = [
  "wordCount",
  "potentialScore",
  "longestWordLength",
  "longWordCount",
  "cellCoverage",
  "greedyDisjointWordCount",
] as const satisfies readonly (keyof BoardMetrics)[];

function normalizeMinimumMetrics(
  thresholds: BoardQualityThresholds | undefined,
): BoardQualityThresholds {
  if (thresholds === undefined) return {};
  if (typeof thresholds !== "object" || thresholds === null) {
    throw new TypeError("Board quality thresholds must be an object.");
  }

  for (const name of BOARD_METRIC_NAMES) {
    const minimum = thresholds[name];
    if (
      minimum !== undefined &&
      (!Number.isFinite(minimum) || minimum < 0)
    ) {
      throw new RangeError(`Minimum ${name} must be a non-negative number.`);
    }
  }
  return thresholds;
}

function meetsMinimumMetrics(
  metrics: BoardMetrics,
  thresholds: BoardQualityThresholds,
): boolean {
  return BOARD_METRIC_NAMES.every(
    (name) => metrics[name] >= (thresholds[name] ?? 0),
  );
}

function boardFromRows(
  rows: readonly string[],
  metrics: BoardMetrics,
  options: BoardSearchOptions,
  generatorVersion: string,
): GeneratedBoard {
  return {
    id: createBoardId(rows, generatorVersion),
    rows,
    letters: rows.map((row) => [...row]),
    metrics,
    seed: options.seed,
    evaluations: options.evaluations,
    generatorVersion,
  };
}

function runBoardSearch(
  trie: WordTrie,
  options: BoardSearchOptions,
): GeneratedBoard {
  requireTrie(trie);

  if (typeof options !== "object" || options === null) {
    throw new TypeError("Board search options must be an object.");
  }

  if (!Number.isSafeInteger(options.evaluations) || options.evaluations < 1) {
    throw new RangeError("Board search evaluations must be a positive integer.");
  }

  const initialTemperature = options.initialTemperature ?? 30;
  const finalTemperature = options.finalTemperature ?? 0.1;
  assertPositiveFinite(initialTemperature, "Initial temperature");
  assertPositiveFinite(finalTemperature, "Final temperature");
  if (finalTemperature > initialTemperature) {
    throw new RangeError(
      "Final temperature must be less than or equal to initial temperature.",
    );
  }

  const generatorVersion = options.generatorVersion ?? BOARD_GENERATOR_VERSION;
  assertGeneratorVersion(generatorVersion);
  const minimumMetrics = normalizeMinimumMetrics(options.minimumMetrics);
  const random = createSeededRandom(options.seed);
  const pool = normalizeLetterPool(options.letterPool ?? DEFAULT_LETTER_POOL);
  const currentLetters = shuffleLetters(pool, random);
  const initialMetrics = measureBoard(rowsFromLetters(currentLetters), trie);
  let currentMetrics = initialMetrics;
  let bestLetters = [...currentLetters];
  let bestMetrics = initialMetrics;
  let bestKey = bestLetters.join("");
  let bestQualifiedLetters = meetsMinimumMetrics(initialMetrics, minimumMetrics)
    ? [...currentLetters]
    : null;
  let bestQualifiedMetrics = bestQualifiedLetters === null
    ? null
    : initialMetrics;
  let bestQualifiedKey = bestQualifiedLetters?.join("") ?? "";

  for (let evaluation = 1; evaluation < options.evaluations; evaluation += 1) {
    const firstIndex = Math.floor(random() * currentLetters.length);
    let secondIndex = Math.floor(random() * (currentLetters.length - 1));
    if (secondIndex >= firstIndex) secondIndex += 1;

    const firstLetter = currentLetters[firstIndex];
    let secondLetter = currentLetters[secondIndex];
    if (firstLetter === undefined || secondLetter === undefined) {
      throw new Error("Board mutation selected an invalid cell.");
    }

    if (firstLetter === secondLetter) {
      for (let offset = 1; offset < currentLetters.length; offset += 1) {
        const alternateIndex = (secondIndex + offset) % currentLetters.length;
        const alternateLetter = currentLetters[alternateIndex];
        if (
          alternateIndex !== firstIndex &&
          alternateLetter !== undefined &&
          alternateLetter !== firstLetter
        ) {
          secondIndex = alternateIndex;
          secondLetter = alternateLetter;
          break;
        }
      }
    }

    currentLetters[firstIndex] = secondLetter;
    currentLetters[secondIndex] = firstLetter;

    const candidateMetrics = measureBoard(rowsFromLetters(currentLetters), trie);
    const candidateKey = currentLetters.join("");
    const bestComparison = compareBoardMetrics(candidateMetrics, bestMetrics);

    if (
      bestComparison > 0 ||
      (bestComparison === 0 && compareStrings(candidateKey, bestKey) < 0)
    ) {
      bestLetters = [...currentLetters];
      bestMetrics = candidateMetrics;
      bestKey = candidateKey;
    }

    if (meetsMinimumMetrics(candidateMetrics, minimumMetrics)) {
      const qualifiedComparison = bestQualifiedMetrics === null
        ? 1
        : compareBoardMetrics(candidateMetrics, bestQualifiedMetrics);
      if (
        qualifiedComparison > 0 ||
        (qualifiedComparison === 0 &&
          compareStrings(candidateKey, bestQualifiedKey) < 0)
      ) {
        bestQualifiedLetters = [...currentLetters];
        bestQualifiedMetrics = candidateMetrics;
        bestQualifiedKey = candidateKey;
      }
    }

    const proposalCount = options.evaluations - 1;
    const progress = proposalCount <= 1
      ? 0
      : (evaluation - 1) / (proposalCount - 1);
    const temperature =
      initialTemperature *
      Math.pow(finalTemperature / initialTemperature, progress);
    const scoreChange = compareBoardMetrics(candidateMetrics, currentMetrics);
    const accept =
      scoreChange >= 0 || random() < Math.exp(scoreChange / temperature);

    if (accept) {
      currentMetrics = candidateMetrics;
    } else {
      currentLetters[firstIndex] = firstLetter;
      currentLetters[secondIndex] = secondLetter;
    }
  }

  const selectedLetters = bestQualifiedLetters ?? bestLetters;
  const selectedMetrics = bestQualifiedMetrics ?? bestMetrics;

  return boardFromRows(
    rowsFromLetters(selectedLetters),
    selectedMetrics,
    options,
    generatorVersion,
  );
}

export function generateBoard(options: GenerateBoardOptions): GeneratedBoard;
export function generateBoard(
  trie: WordTrie,
  options: BoardSearchOptions,
): GeneratedBoard;
/**
 * Search exactly `evaluations` arrangements with deterministic swap mutations
 * and simulated-annealing acceptance. Either overload is convenient for a CLI.
 */
export function generateBoard(
  trieOrOptions: WordTrie | GenerateBoardOptions,
  maybeOptions?: BoardSearchOptions,
): GeneratedBoard {
  if (maybeOptions === undefined) {
    const options = trieOrOptions as GenerateBoardOptions;
    if (typeof options !== "object" || options === null || !("trie" in options)) {
      throw new TypeError("generateBoard() requires a dictionary trie.");
    }
    return runBoardSearch(options.trie, options);
  }

  return runBoardSearch(trieOrOptions as WordTrie, maybeOptions);
}

export const searchBoard = generateBoard;
