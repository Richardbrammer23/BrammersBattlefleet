import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:54329/postgres';
process.env.ALLOW_TEST_SEED = '1';

const { handleApi } = await import('./api.js');
const { db, closeDb } = await import('./db.js');
const { DEFAULT_AVATAR } = await import('../src/avatar/options.js');
const { createGame, shipCells, key } = await import('../src/engine/index.js');

const FLEET = [
  { id: 'carrier', r: 0, c: 0, orientation: 'H' },
  { id: 'battleship', r: 1, c: 0, orientation: 'H' },
  { id: 'cruiser', r: 2, c: 0, orientation: 'H' },
  { id: 'submarine', r: 3, c: 0, orientation: 'H' },
  { id: 'destroyer', r: 4, c: 0, orientation: 'H' },
];

let ipCounter = 0;
async function call(method: string, path: string, opts: { token?: string; body?: unknown; seed?: number; ip?: string; query?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.seed != null) headers['x-test-seed'] = String(opts.seed);
  return handleApi({ method, path, headers, query: opts.query ?? {}, body: opts.body, ip: opts.ip ?? `10.0.${++ipCounter}.1` });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const b = (r: { body: unknown }) => r.body as any;

async function newPlayer(name = 'Tester') {
  const r = await call('POST', '/players', { body: { displayName: name, avatar: DEFAULT_AVATAR } });
  expect(r.status).toBe(201);
  return b(r) as { token: string; recoveryCode: string; player: { id: string } };
}

/** Play a full winning game using knowledge of the seeded enemy fleet (test-only). */
async function winGame(token: string, mode: 'devin' | 'codeassist' | 'traditional', seed: number, decision?: string, extraMisses = 0) {
  const g = b(await call('POST', '/games', { token, body: { mode, fleet: FLEET }, seed }));
  const enemy = (createGame(mode, FLEET as never, seed) as unknown as { ok: true; value: { enemyFleet: never[]; size: number } }).value;
  if (decision) await call('POST', `/games/${g.id}/assist`, { token, body: { decision } });
  await call('POST', `/games/${g.id}/start`, { token });
  let game = b(await call('GET', `/games/${g.id}`, { token })).game;
  const done = new Set(game.playerShots.map(key));
  const ships = new Set(enemy.enemyFleet.flatMap((s: never) => shipCells(s)).map(key));
  let last;
  let misses = 0;
  for (let r = enemy.size - 1; r >= 0 && misses < extraMisses; r--)
    for (let c = enemy.size - 1; c >= 0 && misses < extraMisses; c--)
      if (!ships.has(`${r},${c}`)) {
        await call('POST', `/games/${g.id}/fire`, { token, body: { r, c } });
        misses++;
      }
  for (const p of enemy.enemyFleet.flatMap((s: never) => shipCells(s))) {
    if (done.has(key(p))) continue;
    last = b(await call('POST', `/games/${g.id}/fire`, { token, body: p }));
    game = last.game;
  }
  return { id: g.id as string, game, last };
}

beforeAll(async () => {
  await db().unsafe(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  await db()`truncate players, games, achievements, rate_limits cascade`;
});
afterAll(closeDb);

describe('players', () => {
  it('creates a profile with a token and recovery code, and recognises the returning player', async () => {
    const p = await newPlayer('Captain Rich');
    expect(p.token.length).toBeGreaterThan(30);
    expect(p.recoveryCode).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
    const me = b(await call('GET', '/players/me', { token: p.token }));
    expect(me.player).toMatchObject({ displayName: 'Captain Rich', avatar: DEFAULT_AVATAR });
    const [row] = await db()`select session_hash, recovery_hash from players where id = ${p.player.id}`;
    expect(row.session_hash).not.toContain(p.token);
  });

  it('validates names (2–15 chars, no abuse) and avatars', async () => {
    expect((await call('POST', '/players', { body: { displayName: 'A' } })).status).toBe(400);
    expect(b(await call('POST', '/players', { body: { displayName: 'Sixteen chars!!!' } })).error).toBe('name_too_long');
    expect(b(await call('POST', '/players', { body: { displayName: '<script>' } })).error).toBe('name_invalid_characters');
    expect(b(await call('POST', '/players', { body: { displayName: 'sh1t f4ce' } })).error).toBe('name_not_allowed');
    expect(b(await call('POST', '/players', { body: { displayName: 'Fuck' } })).error).toBe('name_not_allowed');
    expect(b(await call('POST', '/players', { body: { displayName: 'Valid', avatar: { ...DEFAULT_AVATAR, hair: 'laser' } } })).error).toBe('invalid_avatar');
    expect((await call('POST', '/players', { body: { displayName: 'Exactly 15 char' } })).status).toBe(201);
  });

  it('edits a profile without creating a duplicate identity', async () => {
    const p = await newPlayer('Editor');
    const r = await call('PATCH', '/players/me', { token: p.token, body: { displayName: 'Edited', avatar: { ...DEFAULT_AVATAR, hair: 'mohawk' } } });
    expect(b(r).player).toMatchObject({ id: p.player.id, displayName: 'Edited' });
    expect(b(r).player.avatar.hair).toBe('mohawk');
    const [{ n }] = await db()`select count(*)::int as n from players where id = ${p.player.id}`;
    expect(n).toBe(1);
  });

  it('rejects unauthorised edits', async () => {
    expect((await call('PATCH', '/players/me', { body: { displayName: 'Hacker' } })).status).toBe(401);
    expect((await call('PATCH', '/players/me', { token: 'forged', body: { displayName: 'Hacker' } })).status).toBe(401);
  });

  it('recovers a profile on another device and rotates the session', async () => {
    const p = await newPlayer('Roamer');
    const r = b(await call('POST', '/players/recover', { body: { recoveryCode: p.recoveryCode.toLowerCase().replace(/-/g, ' ') } }));
    expect(r.player.id).toBe(p.player.id);
    expect((await call('GET', '/players/me', { token: r.token })).status).toBe(200);
    expect((await call('GET', '/players/me', { token: p.token })).status).toBe(401);
    expect((await call('POST', '/players/recover', { body: { recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' } })).status).toBe(404);
  });

  it('rate-limits profile creation per IP', async () => {
    const statuses = [];
    for (let i = 0; i < 22; i++) statuses.push((await call('POST', '/players', { body: { displayName: `Spam ${i}` }, ip: '9.9.9.9' })).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('server-authoritative games', () => {
  it('never exposes the enemy fleet or targets before a decision', async () => {
    const p = await newPlayer();
    const r = b(await call('POST', '/games', { token: p.token, body: { mode: 'devin', fleet: FLEET } }));
    const text = JSON.stringify(r);
    expect(text).not.toContain('enemyFleet');
    expect(text).not.toContain('assistTargets');
    expect(text).not.toContain('rngState');
    expect(r.game.highlighted).toEqual([]);
  });

  it('rejects invalid fleets and modes', async () => {
    const p = await newPlayer();
    expect(b(await call('POST', '/games', { token: p.token, body: { mode: 'devin', fleet: FLEET.slice(1) } })).error).toBe('fleet_missing_ship');
    expect(b(await call('POST', '/games', { token: p.token, body: { mode: 'godmode', fleet: FLEET } })).error).toBe('invalid_mode');
  });

  it('ignores client-supplied seeds when test seeds are disabled', async () => {
    process.env.ALLOW_TEST_SEED = '0';
    const p = await newPlayer();
    const a = b(await call('POST', '/games', { token: p.token, body: { mode: 'traditional', fleet: FLEET }, seed: 5 }));
    const c = b(await call('POST', '/games', { token: p.token, body: { mode: 'traditional', fleet: FLEET }, seed: 5 }));
    const [ra] = await db()`select state from games where id = ${a.id}`;
    const [rc] = await db()`select state from games where id = ${c.id}`;
    expect(ra.state.enemyFleet).not.toEqual(rc.state.enemyFleet);
    process.env.ALLOW_TEST_SEED = '1';
  });

  it('PR merge applies 9 hits, zero turns, and cannot be merged twice (including concurrently)', async () => {
    const p = await newPlayer();
    const g = b(await call('POST', '/games', { token: p.token, body: { mode: 'devin', fleet: FLEET } }));
    const results = await Promise.all([1, 2, 3].map(() => call('POST', `/games/${g.id}/assist`, { token: p.token, body: { decision: 'merge' } })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => b(r).error === 'already_decided')).toBe(true);
    const game = b(await call('GET', `/games/${g.id}`, { token: p.token })).game;
    expect(game.playerShots).toHaveLength(9);
    expect(game.humanTurns).toBe(0);
    expect(game.assistanceStatus).toBe('PR merged');
  });

  it('Code Assist decline shows 1 target and records the status', async () => {
    const p = await newPlayer();
    const g = b(await call('POST', '/games', { token: p.token, body: { mode: 'codeassist', fleet: FLEET } }));
    const r = b(await call('POST', `/games/${g.id}/assist`, { token: p.token, body: { decision: 'decline' } }));
    expect(r.game.highlighted).toHaveLength(1);
    expect(r.game.playerShots).toHaveLength(0);
    expect(r.game.assistanceStatus).toBe('Declined (1 target shown)');
  });

  it('concurrent duplicate shots consume exactly one turn', async () => {
    const p = await newPlayer();
    const g = b(await call('POST', '/games', { token: p.token, body: { mode: 'traditional', fleet: FLEET } }));
    await call('POST', `/games/${g.id}/start`, { token: p.token });
    const rs = await Promise.all([1, 2, 3, 4].map(() => call('POST', `/games/${g.id}/fire`, { token: p.token, body: { r: 7, c: 7 } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    const game = b(await call('GET', `/games/${g.id}`, { token: p.token })).game;
    expect(game.humanTurns).toBe(1);
    expect(game.aiShots).toHaveLength(1);
  });

  it("players cannot see or play another player's game", async () => {
    const a = await newPlayer();
    const c = await newPlayer();
    const g = b(await call('POST', '/games', { token: a.token, body: { mode: 'traditional', fleet: FLEET } }));
    expect((await call('GET', `/games/${g.id}`, { token: c.token })).status).toBe(404);
    expect((await call('POST', `/games/${g.id}/start`, { token: c.token })).status).toBe(404);
    expect((await call('GET', `/games/${randomUUID()}`, { token: a.token })).status).toBe(404);
  });

  it('resumes the active game after a refresh, and abandons it when a new one starts', async () => {
    const p = await newPlayer();
    const g1 = b(await call('POST', '/games', { token: p.token, body: { mode: 'traditional', fleet: FLEET } }));
    expect(b(await call('GET', '/games/active', { token: p.token })).id).toBe(g1.id);
    const g2 = b(await call('POST', '/games', { token: p.token, body: { mode: 'devin', fleet: FLEET } }));
    expect(b(await call('GET', '/games/active', { token: p.token })).id).toBe(g2.id);
    const [row] = await db()`select phase from games where id = ${g1.id}`;
    expect(row.phase).toBe('abandoned');
    expect((await call('POST', `/games/${g1.id}/start`, { token: p.token })).status).toBe(409);
  });

  it('a won game records server-side stats, achievements, rank and blocks further shots', async () => {
    const p = await newPlayer('Winner');
    const { id, game, last } = await winGame(p.token, 'devin', 11, 'merge');
    expect(game.phase).toBe('won');
    expect(game.humanTurns).toBe(8);
    expect(game.enemyRevealed).toHaveLength(5);
    expect(last.victory.rank.overall).toBeGreaterThanOrEqual(1);
    expect(last.victory.personalBest).toBe(true);
    expect(last.victory.newAchievements.map((a: { code: string }) => a.code)).toContain('devin_commander');
    expect((await call('POST', `/games/${id}/fire`, { token: p.token, body: { r: 9, c: 9 } })).status).toBe(409);
    const me = b(await call('GET', '/players/me', { token: p.token }));
    expect(me.personalBests[0]).toMatchObject({ mode: 'devin', humanTurns: 8 });
    expect(me.achievements.map((a: { code: string }) => a.code)).toContain('fleet_commander');
  });
});

describe('leaderboard', () => {
  it('ranks by human turns, then time, then earliest submission; filters by mode; shows identity', async () => {
    await db()`truncate games, achievements cascade`;
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const cara = await newPlayer('Cara');
    await winGame(alice.token, 'traditional', 21, undefined, 3); // 20 turns
    await winGame(bob.token, 'devin', 22, 'merge', 2); // 10 turns
    await winGame(cara.token, 'codeassist', 23, 'accept'); // 17 turns
    // Force a turn tie broken by time: give Cara a second 10-turn Devin game with a slower time.
    const slow = await winGame(cara.token, 'devin', 24, 'merge', 2);
    await db()`update games set duration_ms = duration_ms + 60000 where id = ${slow.id}`;

    const overall = b(await call('GET', '/leaderboard', { query: { limit: '10' } }));
    expect(overall.entries.map((e: { displayName: string; humanTurns: number }) => `${e.displayName}:${e.humanTurns}`)).toEqual([
      'Bob:10',
      'Cara:10',
      'Cara:17',
      'Alice:20',
    ]);
    expect(overall.entries[0]).toMatchObject({ rank: 1, mode: 'devin', assistanceStatus: 'PR merged' });
    expect(overall.entries[0].avatar).toEqual(DEFAULT_AVATAR);
    expect(overall.entries[3].assistanceStatus).toBe('No assistance');

    const trad = b(await call('GET', '/leaderboard', { query: { mode: 'traditional' } }));
    expect(trad.entries).toHaveLength(1);
    expect(trad.entries[0]).toMatchObject({ rank: 1, displayName: 'Alice' });
    expect((await call('GET', '/leaderboard', { query: { mode: 'cheat' } })).status).toBe(400);
  });

  it('only verified wins appear (lost/abandoned/in-progress games are excluded)', async () => {
    const p = await newPlayer('Quitter');
    await call('POST', '/games', { token: p.token, body: { mode: 'devin', fleet: FLEET } });
    const lb = b(await call('GET', '/leaderboard', { query: { limit: '100' } }));
    expect(lb.entries.some((e: { displayName: string }) => e.displayName === 'Quitter')).toBe(false);
  });

  it('a profile edit updates the leaderboard without duplicating the player', async () => {
    const lb1 = b(await call('GET', '/leaderboard', {}));
    const bobEntry = lb1.entries.find((e: { displayName: string }) => e.displayName === 'Bob');
    const [{ session_hash }] = await db()`select session_hash from players where id = ${bobEntry.playerId}`;
    expect(session_hash).toBeTruthy();
    await db()`update players set display_name = 'Bobby' where id = ${bobEntry.playerId}`;
    const lb2 = b(await call('GET', '/leaderboard', {}));
    expect(lb2.entries.filter((e: { playerId: string }) => e.playerId === bobEntry.playerId).map((e: { displayName: string }) => e.displayName)).toEqual(['Bobby']);
  });
});
