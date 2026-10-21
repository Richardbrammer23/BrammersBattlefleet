import type { AiStrategy, AiView } from './index.js';
import { unknownCells } from './index.js';

const HIT_WEIGHT = 50;

/** Probability density over every placement of every remaining ship consistent with the shooter's knowledge. */
export function densityMap(view: AiView): number[][] {
  const { size, grid } = view;
  const density = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const openHitsExist = grid.some((row) => row.includes('hit'));
  for (const len of view.remaining) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        for (const horizontal of [true, false]) {
          if (horizontal ? c + len > size : r + len > size) continue;
          let hitsCovered = 0;
          let legal = true;
          for (let i = 0; i < len; i++) {
            const cell = horizontal ? grid[r][c + i] : grid[r + i][c];
            if (cell === 'miss' || cell === 'sunk') {
              legal = false;
              break;
            }
            if (cell === 'hit') hitsCovered++;
          }
          if (!legal) continue;
          // While unresolved hits exist, only placements explaining them matter (target mode).
          if (openHitsExist && hitsCovered === 0) continue;
          const weight = hitsCovered ? HIT_WEIGHT * hitsCovered : 1;
          for (let i = 0; i < len; i++) {
            const rr = horizontal ? r : r + i;
            const cc = horizontal ? c + i : c;
            if (grid[rr][cc] === 'unknown') density[rr][cc] += weight;
          }
        }
      }
    }
  }
  return density;
}

/** Hard: fire at the highest-probability unknown cell (random tie-break). */
export const hardAi: AiStrategy = (view, rng) => {
  const density = densityMap(view);
  const unknown = unknownCells(view);
  let best = -1;
  let candidates = unknown;
  for (const p of unknown) {
    const d = density[p.r][p.c];
    if (d > best) {
      best = d;
      candidates = [p];
    } else if (d === best) candidates.push(p);
  }
  return rng.pick(candidates);
};
