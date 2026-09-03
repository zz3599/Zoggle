export interface Coordinate {
  readonly row: number;
  readonly col: number;
}

export type LetterGrid = readonly (readonly string[])[];

export interface BoardDefinition {
  readonly id: string;
  readonly letters: LetterGrid;
}
