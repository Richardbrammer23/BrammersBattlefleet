import { AI, type AiView } from './ai/index.js';
import { selectAssistTargets } from './assist.js';
import { normaliseFleet, randomFleet, shipCells, shipLength, SHIPS, validateFleet, type PlacementError } from './fleet.js';
import { MODES } from './modes.js';
import { Rng } from './rng.js';
import { fleetDestroyed, knowledgeGrid, resolveShot, shotError, sunkShipIds, type ShotError } from './shots.js';
import type { Coord, Fleet, Mode, PlacedShip, Shot } from './types.js';

export type Phase = 'briefing' | 'playing' | 'won' | 'lost';
export type AssistDecision = 'merge' | 'accept' | 'decline';

export interface GameState {
  mode: Mode;
  size: number;
  phase: Phase;
  playerFleet: Fleet;
  enemyFleet: Fleet;
  /** Shots on the enemy fleet (human + Devin autonomous). */
  playerShots: Shot[];
  /** AI shots on the player's fleet. */
  aiShots: Shot[];
  assistTargets: Coord[];
  highlighted: Coord[];
  decision: AssistDecision | null;
  humanTurns: number;
  rngState: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Server time of the last human shot (and Captain Brammer's reply). Set by the API. */
  lastShotAt?: number;
}

export type GameError =
  | PlacementError
  | ShotError
  | 'wrong_phase'
  | 'invalid_decision'
  | 'already_decided'
  | 'decision_required';

export type Result<T> = { ok: true; value: T } | { ok: false; error: GameError };
const fail = <T>(error: GameError): Result<T> => ({ ok: false, error });

export function createGame(mode: Mode, playerFleet: Fleet, seed: number): Result<GameState> {
  const cfg = MODES[mode];
  const err = validateFleet(playerFleet, cfg.boardSize);
  if (err) return fail(err);
  const rng = new Rng(seed);
  const enemyFleet = randomFleet(cfg.boardSize, rng);
  const assistTargets = selectAssistTargets(enemyFleet, cfg.assistTargets, cfg.minShipsSpanned, rng);
  return {
    ok: true,
    value: {
      mode,
      size: cfg.boardSize,
      phase: 'briefing',
      playerFleet: normaliseFleet(playerFleet),
      enemyFleet,
      playerShots: [],
      aiShots: [],
      assistTargets,
      highlighted: [],
      decision: null,
      humanTurns: 0,
      rngState: rng.state,
      startedAt: null,
      endedAt: null,
    },
  };
}

const VALID_DECISIONS: Record<Mode, AssistDecision[]> = {
  devin: ['merge', 'decline'],
  codeassist: ['accept', 'decline'],
  traditional: [],
};

/** Apply the player's response to the assistant. Idempotency guard: only one decision per game. */
export function decideAssist(state: GameState, decision: AssistDecision): Result<GameState> {
  if (state.phase !== 'briefing') return fail('wrong_phase');
  if (state.decision) return fail('already_decided');
  if (!VALID_DECISIONS[state.mode].includes(decision)) return fail('invalid_decision');
  const s: GameState = { ...state, decision, playerShots: [...state.playerShots] };
  if (decision === 'merge') {
    for (const p of state.assistTargets) s.playerShots.push({ ...resolveShot(s.enemyFleet, s.playerShots, p), auto: true });
    s.highlighted = [];
  } else if (decision === 'accept') {
    s.highlighted = [...state.assistTargets];
  } else {
    s.highlighted = state.assistTargets.slice(0, MODES[state.mode].declineHighlights);
  }
  return { ok: true, value: s };
}

/** Player gains control: the ranked timer starts now. */
export function startGame(state: GameState, now: number): Result<GameState> {
  if (state.phase !== 'briefing') return fail('wrong_phase');
  if (VALID_DECISIONS[state.mode].length && !state.decision) return fail('decision_required');
  return { ok: true, value: { ...state, phase: 'playing', startedAt: now } };
}

export function aiView(state: GameState): AiView {
  const sunk = new Set(sunkShipIds(state.aiShots));
  return {
    size: state.size,
    grid: knowledgeGrid(state.playerFleet, state.aiShots, state.size),
    remaining: SHIPS.filter((s) => !sunk.has(s.id)).map((s) => s.length),
  };
}

export interface FireOutcome {
  state: GameState;
  playerShot: Shot;
  aiShot: Shot | null;
}

/** One human turn: the human fires, then (unless the game is over) the AI fires back. */
export function fire(state: GameState, p: Coord, now: number): Result<FireOutcome> {
  if (state.phase !== 'playing') return fail('wrong_phase');
  const target = { r: p.r, c: p.c };
  const err = shotError(state.playerShots, target, state.size);
  if (err) return fail(err);
  const s: GameState = { ...state, playerShots: [...state.playerShots], aiShots: [...state.aiShots] };
  const playerShot = resolveShot(s.enemyFleet, s.playerShots, target);
  s.playerShots.push(playerShot);
  s.humanTurns += 1;
  s.highlighted = s.highlighted.filter((h) => !(h.r === target.r && h.c === target.c));
  if (fleetDestroyed(s.enemyFleet, s.playerShots)) {
    return { ok: true, value: { state: { ...s, phase: 'won', endedAt: now }, playerShot, aiShot: null } };
  }
  const rng = new Rng(s.rngState);
  const aiTarget = AI[MODES[s.mode].difficulty](aiView(s), rng);
  s.rngState = rng.state;
  const aiShot = resolveShot(s.playerFleet, s.aiShots, aiTarget);
  s.aiShots.push(aiShot);
  if (fleetDestroyed(s.playerFleet, s.aiShots)) {
    return { ok: true, value: { state: { ...s, phase: 'lost', endedAt: now }, playerShot, aiShot } };
  }
  return { ok: true, value: { state: s, playerShot, aiShot } };
}

export function assistanceStatus(state: Pick<GameState, 'mode' | 'decision'>): string {
  switch (state.mode) {
    case 'devin':
      return state.decision === 'merge' ? 'PR merged' : state.decision === 'decline' ? 'PR declined (9 targets shown)' : 'Pending';
    case 'codeassist':
      return state.decision === 'accept' ? 'Accepted (3 targets shown)' : state.decision === 'decline' ? 'Declined (1 target shown)' : 'Pending';
    default:
      return 'No assistance';
  }
}

export interface GameStats {
  humanTurns: number;
  humanHits: number;
  accuracy: number;
  longestStreak: number;
  autoHits: number;
  durationMs: number | null;
}

export function gameStats(state: GameState): GameStats {
  const human = state.playerShots.filter((s) => !s.auto);
  let streak = 0;
  let longest = 0;
  for (const s of human) {
    streak = s.result === 'miss' ? 0 : streak + 1;
    longest = Math.max(longest, streak);
  }
  const humanHits = human.filter((s) => s.result !== 'miss').length;
  return {
    humanTurns: state.humanTurns,
    humanHits,
    accuracy: human.length ? humanHits / human.length : 0,
    longestStreak: longest,
    autoHits: state.playerShots.length - human.length,
    durationMs: state.startedAt != null && state.endedAt != null ? state.endedAt - state.startedAt : null,
  };
}

/** The only representation of a game ever sent to the browser. Hidden enemy ships stay secret until the game ends. */
export interface PublicGame {
  mode: Mode;
  size: number;
  phase: Phase;
  playerFleet: Fleet;
  playerShots: Shot[];
  aiShots: Shot[];
  enemySunk: PlacedShip[];
  enemyRevealed: PlacedShip[] | null;
  assistTargetCount: number;
  highlighted: Coord[];
  decision: AssistDecision | null;
  assistanceStatus: string;
  humanTurns: number;
  startedAt: number | null;
  endedAt: number | null;
  stats: GameStats;
}

export function publicGame(state: GameState): PublicGame {
  const sunk = new Set(sunkShipIds(state.playerShots));
  const over = state.phase === 'won' || state.phase === 'lost';
  return {
    mode: state.mode,
    size: state.size,
    phase: state.phase,
    playerFleet: state.playerFleet,
    playerShots: state.playerShots,
    aiShots: state.aiShots,
    enemySunk: state.enemyFleet.filter((s) => sunk.has(s.id)),
    enemyRevealed: over ? state.enemyFleet : null,
    assistTargetCount: state.assistTargets.length,
    highlighted: state.phase === 'briefing' && !state.decision ? [] : state.highlighted,
    decision: state.decision,
    assistanceStatus: assistanceStatus(state),
    humanTurns: state.humanTurns,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    stats: gameStats(state),
  };
}

export { shipCells, shipLength };
