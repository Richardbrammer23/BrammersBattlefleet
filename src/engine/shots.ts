import { inBounds, key, shipAt, shipCells } from './fleet.js';
import type { CellKnowledge, Coord, Fleet, Shot } from './types.js';

export type ShotError = 'out_of_bounds' | 'duplicate';

export function shotError(shots: readonly Shot[], p: Coord, size: number): ShotError | null {
  if (!inBounds(p, size)) return 'out_of_bounds';
  if (shots.some((s) => s.r === p.r && s.c === p.c)) return 'duplicate';
  return null;
}

/** Resolve a shot at `p` against `fleet` given the previous shots on that fleet. Caller must validate first. */
export function resolveShot(fleet: Fleet, previous: readonly Shot[], p: Coord): Shot {
  const ship = shipAt(fleet, p);
  if (!ship) return { r: p.r, c: p.c, result: 'miss' };
  const hitKeys = new Set(previous.filter((s) => s.result !== 'miss').map(key));
  hitKeys.add(key(p));
  const sunk = shipCells(ship).every((q) => hitKeys.has(key(q)));
  return sunk ? { r: p.r, c: p.c, result: 'sunk', sunkShip: ship.id } : { r: p.r, c: p.c, result: 'hit' };
}

export function fleetDestroyed(fleet: Fleet, shots: readonly Shot[]): boolean {
  const hitKeys = new Set(shots.filter((s) => s.result !== 'miss').map(key));
  return fleet.flatMap(shipCells).every((p) => hitKeys.has(key(p)));
}

export function sunkShipIds(shots: readonly Shot[]) {
  return shots.filter((s) => s.sunkShip).map((s) => s.sunkShip!);
}

/**
 * The shooter's legitimate knowledge of the target board: misses, hits and — once a ship
 * is sunk — which cells belonged to it (the defender announces and reveals sunk ships).
 */
export function knowledgeGrid(fleet: Fleet, shots: readonly Shot[], size: number): CellKnowledge[][] {
  const grid: CellKnowledge[][] = Array.from({ length: size }, () => Array<CellKnowledge>(size).fill('unknown'));
  for (const s of shots) grid[s.r][s.c] = s.result === 'miss' ? 'miss' : 'hit';
  for (const id of sunkShipIds(shots)) {
    const ship = fleet.find((f) => f.id === id);
    if (ship) for (const p of shipCells(ship)) grid[p.r][p.c] = 'sunk';
  }
  return grid;
}
