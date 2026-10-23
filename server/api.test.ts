import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:54329/postgres';
process.env.ALLOW_TEST_SEED = '1';

const { handleApi, MIN_TURN_GAP_MS, LEADERBOARD_MAX } = await import('./api.js');
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
let nameCounter = 0;
type CallOpts = { token?: string; cookie?: string; contentType?: string; proto?: string; body?: unknown; seed?: number; ip?: string; query?: Record<string, string>; realTurns?: boolean };
async function call(method: string, path: string, opts: CallOpts = {}) {
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie !== undefined) headers.cookie = `theme=dark; bbf_session=${opts.cookie}`;
  if (opts.proto) headers['x-forwarded-proto'] = opts.proto;
  if (opts.seed != null) headers['x-test-seed'] = String(opts.seed);
  // Tests skip Captain Brammer's 2 s turn gap unless they are testing it.
  if (!opts.realTurns) headers['x-test-fast-turns'] = '1';
  return handleApi({ method, path, headers, query: opts.query ?? {}, body: opts.body, ip: opts.ip ?? `10.0.${++ipCounter}.1` });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const b = (r: { body: unknown }) => r.body as any;
const setCookie = (r: { headers?: Record<string, string> }) => r.headers?.['Set-Cookie'] ?? '';
const tokenOf = (r: { headers?: Record<string, string> }) => /bbf_session=([^;]*)/.exec(setCookie(r))?.[1] ?? '';

async function newPlayer(name = `Tester ${++nameCounter}`, ip?: string) {
  const r = await call('POST', '/players', { body: { displayName: name, avatar: DEFAULT_AVATAR }, ip });
  expect(r.status).toBe(201);
  return { ...b(r), token: tokenOf(r) } as { token: string; recoveryCode: string; player: { id: string; displayName: string } };
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
  // Clear first: the unique-name index can't be created over duplicates left by older runs.
  await db()`truncate players, games, achievements, rate_limits cascade`.catch(() => undefined);
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
    const res = await call('POST', '/players/recover', { body: { recoveryCode: p.recoveryCode.toLowerCase().replace(/-/g, ' ') } });
    const r = b(res);
    expect(r.player.id).toBe(p.player.id);
    expect(r.token).toBeUndefined();
    expect((await call('GET', '/players/me', { cookie: tokenOf(res) })).status).toBe(200);
    expect((await call('GET', '/players/me', { token: p.token })).status).toBe(401);
    expect((await call('POST', '/players/recover', { body: { recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' } })).status).toBe(404);
  });

  it('issues a new recovery code from the profile and retires the old one', async () => {
    const p = await newPlayer('Rekey');
    expect((await call('POST', '/players/me/recovery-code')).status).toBe(401);
    expect((await call('POST', '/players/me/recovery-code', { cookie: p.token, contentType: 'text/plain' })).status).toBe(403);
    const res = await call('POST', '/players/me/recovery-code', { cookie: p.token });
    expect(res.status).toBe(200);
    const fresh = b(res).recoveryCode as string;
    expect(fresh).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(fresh).not.toBe(p.recoveryCode);
    expect((await call('GET', '/players/me', { cookie: p.token })).status).toBe(200);
    expect((await call('POST', '/players/recover', { body: { recoveryCode: p.recoveryCode } })).status).toBe(404);
    const restored = await call('POST', '/players/recover', { body: { recoveryCode: fresh } });
    expect(b(restored).player.id).toBe(p.player.id);
  });

  it('limits how often a player can issue new recovery codes', async () => {
    const p = await newPlayer('Rekey Spam');
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await call('POST', '/players/me/recovery-code', { cookie: p.token })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
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

  it("enforces Captain Brammer's turn gap on the server, so scripted clients can't skip it", async () => {
    const p = await newPlayer();
    const g = b(await call('POST', '/games', { token: p.token, body: { mode: 'traditional', fleet: FLEET } }));
    await call('POST', `/games/${g.id}/start`, { token: p.token });
    const fire = (r: number, c: number) => call('POST', `/games/${g.id}/fire`, { token: p.token, body: { r, c }, realTurns: true });
    expect((await fire(14, 14)).status).toBe(200);
    const tooFast = await fire(14, 13);
    expect(tooFast.status).toBe(429);
    expect(b(tooFast).error).toBe('too_fast');
    // Shots that break the rules report the rule, not "too fast", since retrying won't help.
    expect(b(await fire(14, 14)).error).toBe('duplicate');
    expect(b(await fire(15, 0)).error).toBe('out_of_bounds');
    let game = b(await call('GET', `/games/${g.id}`, { token: p.token })).game;
    expect(game.humanTurns).toBe(1);
    expect(game.aiShots).toHaveLength(1);
    expect(game).not.toHaveProperty('lastShotAt');

    // Once Captain Brammer's reply is older than the gap, the next shot is accepted.
    await db()`update games set state = jsonb_set(state, '{lastShotAt}', to_jsonb((state->>'lastShotAt')::bigint - ${MIN_TURN_GAP_MS})) where id = ${g.id}`;
    expect((await fire(14, 13)).status).toBe(200);
    game = b(await call('GET', `/games/${g.id}`, { token: p.token })).game;
    expect(game.humanTurns).toBe(2);

    // The test-only bypass header is ignored unless test hooks are enabled.
    process.env.ALLOW_TEST_SEED = '0';
    try {
      const r = await call('POST', `/games/${g.id}/fire`, { token: p.token, body: { r: 14, c: 12 } });
      expect(r.status).toBe(429);
    } finally {
      process.env.ALLOW_TEST_SEED = '1';
    }
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

  it('lists every win, including several from one player, capped at 20 places', async () => {
    await db()`truncate games, achievements cascade`;
    const p = await newPlayer('Grinder');
    const q = await newPlayer('Rival');
    await db()`
      insert into games (player_id, mode, phase, state, assistance_status, human_turns, duration_ms, ended_at)
      select case when i % 2 = 0 then ${p.player.id}::uuid else ${q.player.id}::uuid end, 'traditional', 'won', '{}'::jsonb, 'No assistance', 20 + i, 60000, now()
      from generate_series(1, 25) as i`;
    for (const limit of [undefined, '20', '100']) {
      const lb = b(await call('GET', '/leaderboard', { query: limit ? { limit } : {} }));
      expect(lb.entries).toHaveLength(LEADERBOARD_MAX);
      expect(lb.total).toBe(25);
      expect(lb.entries.map((e: { rank: number }) => e.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
    const lb = b(await call('GET', '/leaderboard', { query: { limit: '5' } }));
    expect(lb.entries).toHaveLength(5);
    expect(new Set(lb.entries.map((e: { playerId: string }) => e.playerId)).size).toBe(2);
    await db()`truncate games, achievements cascade`;
  });
});

describe('unique names', () => {
  it('rejects duplicate names, ignoring case and surrounding/extra spaces, without revealing the owner', async () => {
    const p = await newPlayer('Unique Cap');
    for (const variant of ['Unique Cap', 'unique cap', 'UNIQUE CAP', '  Unique Cap  ', 'Unique   Cap']) {
      const r = await call('POST', '/players', { body: { displayName: variant } });
      expect(r.status).toBe(409);
      expect(b(r)).toEqual({ error: 'name_taken' });
      expect(setCookie(r)).toBe('');
    }
    const [{ n }] = await db()`select count(*)::int as n from players where name_key = 'unique cap'`;
    expect(n).toBe(1);
    expect(b(await call('GET', '/players/me', { token: p.token })).player.displayName).toBe('Unique Cap');
  });

  it('enforces uniqueness in the database, even for concurrent sign-ups', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/players', { body: { displayName: i % 2 ? 'RACE NAME' : 'race name' } })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    await expect(db()`insert into players (display_name, session_hash, recovery_hash) values ('Race Name', 'x1', 'y1')`).rejects.toMatchObject({ code: '23505' });
  });

  it('reports name availability', async () => {
    await newPlayer('Taken One');
    expect(b(await call('GET', '/players/available', { query: { name: ' taken one ' } }))).toEqual({ available: false });
    expect(b(await call('GET', '/players/available', { query: { name: 'Free One' } }))).toEqual({ available: true });
    expect((await call('GET', '/players/available', { query: { name: 'x' } })).status).toBe(400);
  });

  it('renames keep the same player, history and achievements, and reject taken names', async () => {
    const other = await newPlayer('Holder');
    const p = await newPlayer('Renamer');
    const win = await winGame(p.token, 'devin', 4242, 'merge');
    expect(win.game.phase).toBe('won');
    const before = b(await call('GET', '/players/me', { token: p.token }));

    const taken = await call('PATCH', '/players/me', { token: p.token, body: { displayName: 'HOLDER' } });
    expect(taken.status).toBe(409);
    expect(b(taken).error).toBe('name_taken');
    expect(b(await call('GET', '/players/me', { token: other.token })).player.displayName).toBe('Holder');

    expect(b(await call('PATCH', '/players/me', { token: p.token, body: { displayName: 'RENAMER' } })).player.displayName).toBe('RENAMER');
    const r = await call('PATCH', '/players/me', { token: p.token, body: { displayName: 'New Name' } });
    expect(b(r).player).toMatchObject({ id: p.player.id, displayName: 'New Name' });
    const after = b(await call('GET', '/players/me', { token: p.token }));
    expect(after.achievements).toEqual(before.achievements);
    expect(after.personalBests).toEqual(before.personalBests);
    expect(after.totals).toEqual(before.totals);
    const lb = b(await call('GET', '/leaderboard', { query: { limit: '100' } }));
    const mine = lb.entries.filter((e: { playerId: string }) => e.playerId === p.player.id);
    expect(mine.map((e: { displayName: string; gameId: string }) => [e.displayName, e.gameId])).toEqual([['New Name', win.id]]);
    expect(lb.entries.some((e: { displayName: string }) => e.displayName === 'Renamer')).toBe(false);
    expect((await call('POST', '/players', { body: { displayName: 'renamer' } })).status).toBe(201);
  });
});

describe('sessions', () => {
  it('sets an HttpOnly session cookie and never returns the token in the body', async () => {
    const r = await call('POST', '/players', { body: { displayName: 'Cookie Cap' }, proto: 'https' });
    expect(r.status).toBe(201);
    expect(b(r).token).toBeUndefined();
    const c = setCookie(r);
    expect(c).toMatch(/^bbf_session=[A-Za-z0-9_-]{40,}; Path=\/api; HttpOnly; SameSite=Lax; Max-Age=\d{7,}; Secure$/);
    const me = await call('GET', '/players/me', { cookie: tokenOf(r) });
    expect(b(me).player.displayName).toBe('Cookie Cap');
    expect(setCookie(me)).toBe('');
    expect(setCookie(await call('POST', '/players', { body: { displayName: 'Local Cap' } }))).not.toContain('Secure');
  });

  it('recognises the returning player on every visit without creating new players', async () => {
    const p = await newPlayer();
    const [{ n: before }] = await db()`select count(*)::int as n from players`;
    for (let i = 0; i < 3; i++) expect(b(await call('GET', '/players/me', { cookie: p.token })).player.id).toBe(p.player.id);
    const [{ n: after }] = await db()`select count(*)::int as n from players`;
    expect(after).toBe(before);
  });

  it('moves a legacy localStorage bearer token into the cookie', async () => {
    const p = await newPlayer();
    const me = await call('GET', '/players/me', { token: p.token });
    expect(me.status).toBe(200);
    expect(tokenOf(me)).toBe(p.token);
    expect((await call('GET', '/players/me', { token: 'forged' })).status).toBe(401);
  });

  it('blocks cookie-authenticated writes without a JSON content type (CSRF)', async () => {
    const p = await newPlayer();
    const forged = await call('PATCH', '/players/me', { cookie: p.token, contentType: 'application/x-www-form-urlencoded', body: { displayName: 'Pwned' } });
    expect(forged.status).toBe(403);
    expect(b(await call('GET', '/players/me', { cookie: p.token })).player.displayName).toBe(p.player.displayName);
    expect((await call('PATCH', '/players/me', { cookie: p.token, body: { displayName: 'Legit Edit' } })).status).toBe(200);
  });

  it('clears a stale cookie after the session is rotated by recovery', async () => {
    const p = await newPlayer();
    await call('POST', '/players/recover', { body: { recoveryCode: p.recoveryCode } });
    const r = await call('GET', '/players/me', { cookie: p.token });
    expect(r.status).toBe(401);
    expect(setCookie(r)).toMatch(/^bbf_session=; .*Max-Age=0/);
  });

  it("a player can only change their own profile; knowing a name grants nothing", async () => {
    const a = await newPlayer('Victim');
    const bad = await newPlayer('Attacker');
    await call('PATCH', '/players/me', { token: bad.token, body: { displayName: 'Attacker2', avatar: { ...DEFAULT_AVATAR, hair: 'mohawk' } } });
    expect(b(await call('GET', '/players/me', { token: a.token })).player).toMatchObject({ id: a.player.id, displayName: 'Victim', avatar: DEFAULT_AVATAR });
    const squat = await call('POST', '/players', { body: { displayName: 'victim' } });
    expect(squat.status).toBe(409);
    expect(b(squat).player).toBeUndefined();
    expect((await call('POST', '/players/recover', { body: { recoveryCode: 'Victim' } })).status).toBe(400);
  });
});

describe('avatars', () => {
  it('a new avatar shows on every historical leaderboard entry and in the profile', async () => {
    const p = await newPlayer('Painter');
    const g1 = await winGame(p.token, 'devin', 777, 'merge');
    const g2 = await winGame(p.token, 'codeassist', 778, 'accept');
    const avatar = { ...DEFAULT_AVATAR, hair: 'mohawk' };
    await call('PATCH', '/players/me', { token: p.token, body: { avatar } });
    const lb = b(await call('GET', '/leaderboard', { query: { limit: '100' } }));
    const mine = lb.entries.filter((e: { playerId: string }) => e.playerId === p.player.id);
    expect(mine.map((e: { gameId: string }) => e.gameId).sort()).toEqual([g1.id, g2.id].sort());
    for (const e of mine) expect(e.avatar).toEqual(avatar);
    expect(b(await call('GET', '/players/me', { token: p.token })).player.avatar).toEqual(avatar);
    const cols = await db()`select column_name from information_schema.columns where table_name = 'games' and column_name like '%avatar%'`;
    expect(cols).toHaveLength(0);
  });
});
