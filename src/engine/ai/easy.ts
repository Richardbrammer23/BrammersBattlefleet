import type { AiStrategy } from './index.js';
import { unknownCells } from './index.js';

/** Easy: uniformly random over cells not yet fired at. */
export const easyAi: AiStrategy = (view, rng) => rng.pick(unknownCells(view));
