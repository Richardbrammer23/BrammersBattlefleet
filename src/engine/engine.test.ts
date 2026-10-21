import { describe, expect, it } from 'vitest';
import {
  AI,
  aiView,
  createGame,
  decideAssist,
  earnedAchievements,
  fire,
  fleetDestroyed,
  gameStats,
  key,
  MODES,
  placementError,
  publicGame,
  randomFleet,
  resolveShot,
  Rng,
  shipAt,
  shipCells,
  SHIPS,
  startGame,
  TOTAL_SHIP_CELLS,
  validateFleet,
  type Fleet,
  type GameState,
  type Mode,
} from './index';

const FLEET: Fleet = [
  { id: 'carrier', r: 0, c: 0, orientation: 'H' },
  { id: 'battleship', r: 1, c: 0, orientation: 'H' },
  { id: 'cruiser', r: 2, c: 0, orientation: 'H' },
  { id: 'submarine', r: 3, c: 0, orientation: 'H' },
  { id: 'destroyer', r: 4, c: 0, orientation: 'H' },
];

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function newGame(mode: Mode, seed = 42): GameState {
  return unwrap(createGame(mode, FLEET, seed));
}

function playing(mode: Mode, decision?: 'merge' | 'accept' | 'decline', seed = 42): GameState {
  let s = newGame(mode, seed);
  if (decision) s = unwrap(decideAssist(s, decision));
  return unwrap(startGame(s, 1000));
}

const enemyCells = (s: GameState) => s.enemyFleet.flatMap(shipCells);

describe('fleet placement', () => {
  it('has the classic composition totalling 17 cells', () => {
    expect(SHIPS.map((s) => s.length)).toEqual([5, 4, 3, 3, 2]);
    expect(TOTAL_SHIP_CELLS).toBe(17);
  });

  it('accepts a valid fleet and allows touching ships', () => {
    expect(validateFleet(FLEET, 10)).toBeNull();
  });

  it('rejects ships outside the board', () => {
    expect(placementError([], { id: 'carrier', r: 0, c: 6, orientation: 'H' }, 10)).toBe('out_of_bounds');
    expect(placementError([], { id: 'carrier', r: 6, c: 0, orientation: 'V' }, 10)).toBe('out_of_bounds');
    expect(placementError([], { id: 'carrier', r: -1, c: 0, orientation: 'V' }, 10)).toBe('out_of_bounds');
    expect(placementError([], { id: 'carrier', r: 0, c: 5, orientation: 'H' }, 10)).toBeNull();
    expect(placementError([], { id: 'carrier', r: 0, c: 10, orientation: 'H' }, 15)).toBeNull();
  });

  it('rejects overlapping ships', () => {
    const bad = [...FLEET.slice(0, 4), { id: 'destroyer' as const, r: 0, c: 4, orientation: 'V' as const }];
    expect(validateFleet(bad, 10)).toBe('overlap');
  });

  it('rejects missing, duplicate and unknown ships', () => {
    expect(validateFleet(FLEET.slice(0, 4), 10)).toBe('missing_ship');
    expect(validateFleet([...FLEET.slice(0, 4), FLEET[0]], 10)).toBe('duplicate_ship');
    expect(validateFleet([...FLEET.slice(0, 4), { id: 'yacht', r: 9, c: 0, orientation: 'H' }], 10)).toBe('unknown_ship');
    expect(validateFleet('nope', 10)).toBe('missing_ship');
    expect(validateFleet([...FLEET.slice(0, 4), { ...FLEET[4], r: 1.5 }], 10)).toBe('out_of_bounds');
  });

  it('generates valid random fleets on 10x10 and 15x15', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 500; i++) {
      expect(validateFleet(randomFleet(10, rng), 10)).toBeNull();
      expect(validateFleet(randomFleet(15, rng), 15)).toBeNull();
    }
  });
});

describe('shots', () => {
  it('detects miss, hit and sunk', () => {
    expect(resolveShot(FLEET, [], { r: 9, c: 9 }).result).toBe('miss');
    expect(resolveShot(FLEET, [], { r: 4, c: 0 }).result).toBe('hit');
    const first = resolveShot(FLEET, [], { r: 4, c: 0 });
    const second = resolveShot(FLEET, [first], { r: 4, c: 1 });
    expect(second).toMatchObject({ result: 'sunk', sunkShip: 'destroyer' });
  });

  it('detects a destroyed fleet', () => {
    const shots = FLEET.flatMap(shipCells).map((p) => ({ ...p, result: 'hit' as const }));
    expect(fleetDestroyed(FLEET, shots)).toBe(true);
    expect(fleetDestroyed(FLEET, shots.slice(1))).toBe(false);
  });
});

describe('turns and game flow', () => {
  it('the human fires first and turns alternate one shot each', () => {
    const s = playing('traditional');
    const out = unwrap(fire(s, { r: 14, c: 14 }, 2000));
    expect(out.state.humanTurns).toBe(1);
    expect(out.state.playerShots).toHaveLength(1);
    expect(out.state.aiShots).toHaveLength(1);
  });

  it('a hit does not grant an extra turn', () => {
    const s = playing('traditional');
    const target = enemyCells(s)[0];
    const out = unwrap(fire(s, target, 2000));
    expect(out.playerShot.result).not.toBe('miss');
    expect(out.state.aiShots).toHaveLength(1);
  });

  it('duplicate and out-of-bounds shots are rejected without consuming a turn', () => {
    const s = unwrap(fire(playing('codeassist', 'accept'), { r: 0, c: 0 }, 2000)).state;
    expect(fire(s, { r: 0, c: 0 }, 2001)).toEqual({ ok: false, error: 'duplicate' });
    expect(fire(s, { r: 10, c: 0 }, 2001)).toEqual({ ok: false, error: 'out_of_bounds' });
    expect(fire(s, { r: 0.5, c: 0 }, 2001)).toEqual({ ok: false, error: 'out_of_bounds' });
    expect(s.humanTurns).toBe(1);
  });

  it('cannot fire before control is given or after the game ends', () => {
    expect(fire(newGame('traditional'), { r: 0, c: 0 }, 0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('assisted modes require a decision before starting', () => {
    expect(startGame(newGame('devin'), 0)).toEqual({ ok: false, error: 'decision_required' });
    expect(startGame(newGame('codeassist'), 0)).toEqual({ ok: false, error: 'decision_required' });
    expect(startGame(newGame('traditional'), 0).ok).toBe(true);
  });

  it('a human can win; the game ends immediately with no AI reply and no further shots', () => {
    let s = playing('traditional');
    let last;
    for (const p of enemyCells(s)) {
      last = unwrap(fire(s, p, 5000));
      s = last.state;
    }
    expect(s.phase).toBe('won');
    expect(last!.aiShot).toBeNull();
    expect(s.humanTurns).toBe(17);
    expect(s.aiShots).toHaveLength(16);
    expect(gameStats(s)).toMatchObject({ durationMs: 4000, accuracy: 1, longestStreak: 17 });
    expect(fire(s, { r: 14, c: 14 }, 6000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a human can lose', () => {
    // 15x15 leaves 208 empty cells, enough misses for the Hard AI to always finish first.
    let s = playing('traditional');
    const rng = new Rng(1);
    const free = () => {
      for (;;) {
        const p = { r: rng.int(15), c: rng.int(15) };
        const taken = s.playerShots.some((x) => x.r === p.r && x.c === p.c);
        if (!taken && !shipAt(s.enemyFleet, p)) return p;
      }
    };
    while (s.phase === 'playing' && s.playerShots.length < 208) s = unwrap(fire(s, free(), 9000)).state;
    expect(s.phase).toBe('lost');
    expect(fleetDestroyed(s.playerFleet, s.aiShots)).toBe(true);
  });

  it('new games reset all state', () => {
    const a = newGame('devin', 1);
    const b = newGame('devin', 2);
    expect(b.playerShots).toEqual([]);
    expect(b.humanTurns).toBe(0);
    expect(a.enemyFleet).not.toEqual(b.enemyFleet);
  });

  it('is deterministic for a given seed', () => {
    expect(newGame('codeassist', 99)).toEqual(newGame('codeassist', 99));
  });
});

describe('Devin workflow', () => {
  it('identifies exactly 9 distinct valid enemy ship cells across at least 3 ships', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = newGame('devin', seed);
      expect(s.assistTargets).toHaveLength(9);
      expect(new Set(s.assistTargets.map(key)).size).toBe(9);
      const ships = new Set(s.assistTargets.map((p) => shipAt(s.enemyFleet, p)?.id));
      expect(ships.has(undefined)).toBe(false);
      expect(ships.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('merging applies exactly 9 hits and consumes zero human turns, with no AI reply', () => {
    const s = unwrap(decideAssist(newGame('devin'), 'merge'));
    expect(s.playerShots).toHaveLength(9);
    expect(s.playerShots.every((x) => x.auto && x.result !== 'miss')).toBe(true);
    expect(s.humanTurns).toBe(0);
    expect(s.aiShots).toHaveLength(0);
    expect(s.highlighted).toHaveLength(0);
  });

  it('the PR cannot be merged twice', () => {
    const s = unwrap(decideAssist(newGame('devin'), 'merge'));
    expect(decideAssist(s, 'merge')).toEqual({ ok: false, error: 'already_decided' });
    expect(decideAssist(s, 'decline')).toEqual({ ok: false, error: 'already_decided' });
  });

  it('declining applies no damage and highlights the same 9 targets', () => {
    const base = newGame('devin');
    const s = unwrap(decideAssist(base, 'decline'));
    expect(s.playerShots).toHaveLength(0);
    expect(s.highlighted).toEqual(base.assistTargets);
  });

  it('declined targets stay highlighted until attacked, and manual attacks consume turns', () => {
    let s = unwrap(startGame(unwrap(decideAssist(newGame('devin'), 'decline')), 0));
    const [first, ...rest] = s.highlighted;
    s = unwrap(fire(s, first, 1)).state;
    expect(s.highlighted).toEqual(rest);
    expect(s.humanTurns).toBe(1);
    expect(s.playerShots[0].result).not.toBe('miss');
  });

  it('cannot merge after the game has started', () => {
    const s = unwrap(startGame(unwrap(decideAssist(newGame('devin'), 'decline')), 0));
    expect(decideAssist(s, 'merge')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('rejects decisions from another mode', () => {
    expect(decideAssist(newGame('devin'), 'accept')).toEqual({ ok: false, error: 'invalid_decision' });
    expect(decideAssist(newGame('traditional'), 'merge')).toEqual({ ok: false, error: 'invalid_decision' });
  });

  it('awards Devin Commander only after a merged win', () => {
    let s = playing('devin', 'merge');
    const hit = new Set(s.playerShots.map(key));
    for (const p of enemyCells(s).filter((p) => !hit.has(key(p)))) s = unwrap(fire(s, p, 2000)).state;
    expect(s.phase).toBe('won');
    expect(s.humanTurns).toBe(8);
    expect(earnedAchievements(s)).toEqual(['fleet_commander', 'sharpshooter', 'perfect_streak', 'speed_captain', 'devin_commander']);
  });
});

describe('Code Assist workflow', () => {
  it('identifies exactly 3 distinct valid targets', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = newGame('codeassist', seed);
      expect(s.assistTargets).toHaveLength(3);
      expect(new Set(s.assistTargets.map(key)).size).toBe(3);
      expect(s.assistTargets.every((p) => shipAt(s.enemyFleet, p))).toBe(true);
    }
  });

  it('accepting highlights all 3 targets without damage', () => {
    const base = newGame('codeassist');
    const s = unwrap(decideAssist(base, 'accept'));
    expect(s.highlighted).toEqual(base.assistTargets);
    expect(s.playerShots).toHaveLength(0);
  });

  it('declining keeps only 1 of the 3 targets highlighted, without damage', () => {
    const base = newGame('codeassist');
    const s = unwrap(decideAssist(base, 'decline'));
    expect(s.highlighted).toHaveLength(1);
    expect(base.assistTargets).toContainEqual(s.highlighted[0]);
    expect(s.playerShots).toHaveLength(0);
  });

  it('manual shots on highlighted targets consume turns', () => {
    let s = playing('codeassist', 'accept');
    for (const p of [...s.highlighted]) s = unwrap(fire(s, p, 1)).state;
    expect(s.humanTurns).toBe(3);
    expect(s.highlighted).toHaveLength(0);
  });
});

describe('Traditional Coding', () => {
  it('uses a 15x15 board with no assistance and no highlights', () => {
    const s = newGame('traditional');
    expect(s.size).toBe(15);
    expect(s.assistTargets).toEqual([]);
    const started = unwrap(startGame(s, 0));
    expect(started.highlighted).toEqual([]);
    expect(MODES.traditional.difficulty).toBe('hard');
  });
});

describe('information hiding', () => {
  it('the public view never contains un-sunk enemy ships while playing', () => {
    const s = playing('devin', 'merge');
    const view = publicGame(s);
    expect(view).not.toHaveProperty('enemyFleet');
    expect(view).not.toHaveProperty('assistTargets');
    expect(view).not.toHaveProperty('rngState');
    expect(view.enemyRevealed).toBeNull();
    const sunk = new Set(s.playerShots.filter((x) => x.sunkShip).map((x) => x.sunkShip));
    expect(view.enemySunk.every((x) => sunk.has(x.id))).toBe(true);
  });

  it('assistance targets are not exposed before the player decides', () => {
    expect(publicGame(newGame('codeassist')).highlighted).toEqual([]);
  });
});

describe('AI opponents', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`${difficulty} AI only fires legal, never-repeated shots and finishes the board`, () => {
      for (const size of [10, 15]) {
        for (let seed = 0; seed < 20; seed++) {
          const rng = new Rng(seed);
          const fleet = randomFleet(size, rng);
          const state = { size, playerFleet: fleet, aiShots: [] } as unknown as GameState;
          const seen = new Set<string>();
          while (!fleetDestroyed(fleet, state.aiShots)) {
            const p = AI[difficulty](aiView(state), rng);
            expect(p.r >= 0 && p.r < size && p.c >= 0 && p.c < size).toBe(true);
            expect(seen.has(key(p))).toBe(false);
            seen.add(key(p));
            state.aiShots.push(resolveShot(fleet, state.aiShots, p));
          }
          expect(seen.size).toBeLessThanOrEqual(size * size);
        }
      }
    });
  }

  it('the AI view contains no fleet information beyond announced sunk ships', () => {
    const s = playing('traditional');
    const view = aiView(s);
    expect(Object.keys(view).sort()).toEqual(['grid', 'remaining', 'size']);
    expect(view.grid.flat().every((c) => c === 'unknown')).toBe(true);
  });

  it('smarter AIs need fewer shots on average', () => {
    const avg = (d: 'easy' | 'medium' | 'hard') => {
      let total = 0;
      for (let seed = 0; seed < 60; seed++) {
        const rng = new Rng(seed);
        const fleet = randomFleet(10, rng);
        const state = { size: 10, playerFleet: fleet, aiShots: [] } as unknown as GameState;
        while (!fleetDestroyed(fleet, state.aiShots)) state.aiShots.push(resolveShot(fleet, state.aiShots, AI[d](aiView(state), rng)));
        total += state.aiShots.length;
      }
      return total / 60;
    };
    const [e, m, h] = [avg('easy'), avg('medium'), avg('hard')];
    expect(m).toBeLessThan(e);
    expect(h).toBeLessThan(m);
  });
});
