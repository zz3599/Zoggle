export const BOARD_GENERATOR_VERSION = "v1";

const UPPERCASE_LETTER = /^[A-Z]$/;

function validateGeneratedRows(rows: readonly string[]): void {
  if (!Array.isArray(rows)) {
    throw new TypeError("Generated board rows must be an array of strings.");
  }

  if (
    rows.length !== 6 ||
    rows.some(
      (row) =>
        typeof row !== "string" ||
        row.length !== 6 ||
        [...row].some((letter) => !UPPERCASE_LETTER.test(letter)),
    )
  ) {
    throw new RangeError(
      "Generated board rows must form a 6x6 uppercase grid.",
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

export function assertGeneratorVersion(generatorVersion: string): void {
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
