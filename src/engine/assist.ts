import { shipAt, shipCells } from './fleet.js';
import type { Rng } from './rng.js';
import type { Coord, Fleet } from './types.js';

/** Pick `count` distinct enemy ship cells spanning at least `minShips` ships. */
export function selectAssistTargets(fleet: Fleet, count: number, minShips: number, rng: Rng): Coord[] {
  if (count === 0) return [];
  const cells = fleet.flatMap(shipCells);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const chosen = rng.shuffle(cells).slice(0, count);
    const ships = new Set(chosen.map((p) => shipAt(fleet, p)!.id));
    if (ships.size >= minShips) return chosen.sort((a, b) => a.r - b.r || a.c - b.c);
  }
  throw new Error('Unable to select assistance targets');
}
