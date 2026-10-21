import type { Rng } from '../rng.js';
import type { CellKnowledge, Coord, Difficulty } from '../types.js';

/**
 * Everything an AI is allowed to know. It deliberately has no access to the target fleet,
 * so an AI cannot cheat by reading hidden ship positions.
 */
export interface AiView {
  size: number;
  grid: CellKnowledge[][];
  /** Lengths of target ships not yet sunk (announced publicly when a ship sinks). */
  remaining: number[];
}

export type AiStrategy = (view: AiView, rng: Rng) => Coord;

export function unknownCells(view: AiView): Coord[] {
  const out: Coord[] = [];
  for (let r = 0; r < view.size; r++) for (let c = 0; c < view.size; c++) if (view.grid[r][c] === 'unknown') out.push({ r, c });
  return out;
}

export const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function isUnknown(view: AiView, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < view.size && c < view.size && view.grid[r][c] === 'unknown';
}

import { easyAi } from './easy.js';
import { mediumAi } from './medium.js';
import { hardAi } from './hard.js';

export const AI: Record<Difficulty, AiStrategy> = { easy: easyAi, medium: mediumAi, hard: hardAi };
