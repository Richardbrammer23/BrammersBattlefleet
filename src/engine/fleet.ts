import type { Rng } from './rng.js';
import type { Coord, Fleet, Orientation, PlacedShip, ShipId, ShipSpec } from './types.js';

export const SHIPS: readonly ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
];

export const TOTAL_SHIP_CELLS = SHIPS.reduce((n, s) => n + s.length, 0);

const LENGTHS: Record<ShipId, number> = Object.fromEntries(SHIPS.map((s) => [s.id, s.length])) as Record<
  ShipId,
  number
>;

export function shipLength(id: ShipId): number {
  return LENGTHS[id];
}

export function shipCells(ship: PlacedShip): Coord[] {
  const len = LENGTHS[ship.id];
  return Array.from({ length: len }, (_, i) =>
    ship.orientation === 'H' ? { r: ship.r, c: ship.c + i } : { r: ship.r + i, c: ship.c },
  );
}

export const key = (p: Coord) => `${p.r},${p.c}`;

export function inBounds(p: Coord, size: number): boolean {
  return Number.isInteger(p.r) && Number.isInteger(p.c) && p.r >= 0 && p.c >= 0 && p.r < size && p.c < size;
}

export type PlacementError = 'out_of_bounds' | 'overlap' | 'unknown_ship' | 'duplicate_ship' | 'missing_ship';

/** Can `ship` be added to `fleet` (ignoring any existing ship with the same id)? */
export function placementError(fleet: Fleet, ship: PlacedShip, size: number): PlacementError | null {
  if (!(ship.id in LENGTHS) || (ship.orientation !== 'H' && ship.orientation !== 'V')) return 'unknown_ship';
  const cells = shipCells(ship);
  if (!cells.every((p) => inBounds(p, size))) return 'out_of_bounds';
  const occupied = new Set(fleet.filter((s) => s.id !== ship.id).flatMap(shipCells).map(key));
  if (cells.some((p) => occupied.has(key(p)))) return 'overlap';
  return null;
}

export function validateFleet(fleet: unknown, size: number): PlacementError | null {
  if (!Array.isArray(fleet)) return 'missing_ship';
  const seen = new Set<string>();
  const placed: Fleet = [];
  for (const raw of fleet as PlacedShip[]) {
    if (!raw || typeof raw !== 'object') return 'unknown_ship';
    const ship: PlacedShip = { id: raw.id, r: raw.r, c: raw.c, orientation: raw.orientation };
    if (seen.has(ship.id)) return 'duplicate_ship';
    const err = placementError(placed, ship, size);
    if (err) return err;
    seen.add(ship.id);
    placed.push(ship);
  }
  return SHIPS.every((s) => seen.has(s.id)) && placed.length === SHIPS.length ? null : 'missing_ship';
}

export function normaliseFleet(fleet: Fleet): Fleet {
  return SHIPS.map((s) => {
    const f = fleet.find((x) => x.id === s.id)!;
    return { id: f.id, r: f.r, c: f.c, orientation: f.orientation };
  });
}

export function randomFleet(size: number, rng: Rng): Fleet {
  for (;;) {
    const fleet: Fleet = [];
    let ok = true;
    for (const spec of SHIPS) {
      let placed = false;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const orientation: Orientation = rng.next() < 0.5 ? 'H' : 'V';
        const maxR = orientation === 'V' ? size - spec.length : size - 1;
        const maxC = orientation === 'H' ? size - spec.length : size - 1;
        const ship: PlacedShip = { id: spec.id, orientation, r: rng.int(maxR + 1), c: rng.int(maxC + 1) };
        if (!placementError(fleet, ship, size)) {
          fleet.push(ship);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return fleet;
  }
}

export function shipAt(fleet: Fleet, p: Coord): PlacedShip | undefined {
  return fleet.find((s) => shipCells(s).some((q) => q.r === p.r && q.c === p.c));
}
