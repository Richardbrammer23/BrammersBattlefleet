export type Mode = 'devin' | 'codeassist' | 'traditional';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Orientation = 'H' | 'V';
export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

export interface Coord {
  r: number;
  c: number;
}

export interface ShipSpec {
  id: ShipId;
  name: string;
  length: number;
}

export interface PlacedShip {
  id: ShipId;
  r: number;
  c: number;
  orientation: Orientation;
}

export type Fleet = PlacedShip[];

export type ShotResult = 'miss' | 'hit' | 'sunk';

export interface Shot extends Coord {
  result: ShotResult;
  sunkShip?: ShipId;
  /** True for Devin's autonomous (merged PR) attacks. */
  auto?: boolean;
}

/** What a shooter legitimately knows about a target board. */
export type CellKnowledge = 'unknown' | 'miss' | 'hit' | 'sunk';
