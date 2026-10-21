import type { Difficulty, Mode } from './types.js';

export interface ModeConfig {
  mode: Mode;
  title: string;
  shortName: string;
  boardSize: number;
  difficulty: Difficulty;
  /** Enemy ship cells the assistant identifies before the first turn. */
  assistTargets: number;
  /** Targets left highlighted if the player declines (Code Assist shows fewer). */
  declineHighlights: number;
  /** Minimum number of distinct ships the identified cells must span. */
  minShipsSpanned: number;
  speedCaptainMs: number;
}

export const MODES: Record<Mode, ModeConfig> = {
  devin: {
    mode: 'devin',
    title: 'Devin — Autonomous Execution',
    shortName: 'Devin',
    boardSize: 10,
    difficulty: 'easy',
    assistTargets: 9,
    declineHighlights: 9,
    minShipsSpanned: 3,
    speedCaptainMs: 2 * 60_000,
  },
  codeassist: {
    mode: 'codeassist',
    title: 'Code Assist — Assisted Development',
    shortName: 'Code Assist',
    boardSize: 10,
    difficulty: 'medium',
    assistTargets: 3,
    declineHighlights: 1,
    minShipsSpanned: 1,
    speedCaptainMs: 3 * 60_000,
  },
  traditional: {
    mode: 'traditional',
    title: 'Traditional Coding — The Manual Challenge',
    shortName: 'Traditional Coding',
    boardSize: 15,
    difficulty: 'hard',
    assistTargets: 0,
    declineHighlights: 0,
    minShipsSpanned: 0,
    speedCaptainMs: 6 * 60_000,
  },
};

export const isMode = (m: unknown): m is Mode => m === 'devin' || m === 'codeassist' || m === 'traditional';
