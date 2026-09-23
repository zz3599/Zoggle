export interface Coordinate {
  readonly row: number;
  readonly col: number;
}

export type GameMode = "classic" | "endless";

export interface TimeBonus {
  readonly key: number;
  readonly seconds: number;
}

export type LetterGrid = readonly (readonly string[])[];

export interface BoardDefinition {
  readonly id: string;
  readonly label?: string;
  readonly letters: LetterGrid;
}
