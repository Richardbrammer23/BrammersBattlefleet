import type { Coord } from '../types.js';
import type { AiStrategy, AiView } from './index.js';
import { NEIGHBOURS, isUnknown, unknownCells } from './index.js';

function openHits(view: AiView): Coord[] {
  const out: Coord[] = [];
  for (let r = 0; r < view.size; r++) for (let c = 0; c < view.size; c++) if (view.grid[r][c] === 'hit') out.push({ r, c });
  return out;
}

/** Cells extending a straight line of ≥2 adjacent open hits. */
function lineExtensions(view: AiView, hits: Coord[]): Coord[] {
  const hitSet = new Set(hits.map((h) => `${h.r},${h.c}`));
  const out: Coord[] = [];
  for (const h of hits) {
    for (const [dr, dc] of NEIGHBOURS) {
      if (!hitSet.has(`${h.r + dr},${h.c + dc}`)) continue;
      // Walk forward along the line until the first non-hit cell.
      let r = h.r + dr;
      let c = h.c + dc;
      while (hitSet.has(`${r},${c}`)) {
        r += dr;
        c += dc;
      }
      if (isUnknown(view, r, c)) out.push({ r, c });
    }
  }
  return out;
}

/**
 * Medium: hunt-and-target.
 * Hunt: fire on a parity lattice sized to the smallest remaining ship.
 * Target: after a hit, extend known lines first, otherwise try orthogonal neighbours.
 */
export const mediumAi: AiStrategy = (view, rng) => {
  const hits = openHits(view);
  if (hits.length) {
    const line = lineExtensions(view, hits);
    if (line.length) return rng.pick(line);
    const adj = hits.flatMap((h) => NEIGHBOURS.map(([dr, dc]) => ({ r: h.r + dr, c: h.c + dc }))).filter((p) => isUnknown(view, p.r, p.c));
    if (adj.length) return rng.pick(adj);
  }
  const unknown = unknownCells(view);
  const step = Math.max(2, Math.min(...view.remaining));
  const lattice = unknown.filter((p) => (p.r + p.c) % step === 0);
  return rng.pick(lattice.length ? lattice : unknown);
};
