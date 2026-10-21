import type { GameState } from './game.js';
import { gameStats } from './game.js';
import { MODES } from './modes.js';

export type AchievementCode = 'fleet_commander' | 'sharpshooter' | 'perfect_streak' | 'speed_captain' | 'devin_commander';

export const ACHIEVEMENTS: Record<AchievementCode, { name: string; description: string }> = {
  fleet_commander: { name: 'Fleet Commander', description: 'Win your first game.' },
  sharpshooter: { name: 'Sharpshooter', description: 'Win with 80% or greater human-shot accuracy.' },
  perfect_streak: { name: 'Perfect Streak', description: 'Win without a single human-shot miss.' },
  speed_captain: {
    name: 'Speed Captain',
    description: 'Win under the mode time threshold (Devin 2:00, Code Assist 3:00, Traditional 6:00).',
  },
  devin_commander: { name: 'Devin Commander', description: "Win after merging Devin's PR." },
};

/** Achievements earned by a single won game (Fleet Commander is awarded on any win; dedupe happens in storage). */
export function earnedAchievements(state: GameState): AchievementCode[] {
  if (state.phase !== 'won') return [];
  const s = gameStats(state);
  const out: AchievementCode[] = ['fleet_commander'];
  if (s.accuracy >= 0.8) out.push('sharpshooter');
  if (s.humanTurns > 0 && s.humanHits === s.humanTurns) out.push('perfect_streak');
  if (s.durationMs != null && s.durationMs < MODES[state.mode].speedCaptainMs) out.push('speed_captain');
  if (state.decision === 'merge') out.push('devin_commander');
  return out;
}
