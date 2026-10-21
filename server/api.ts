import type postgres from 'postgres';
import { parseAvatar, type AvatarConfig } from '../src/avatar/options.js';
import {
  ACHIEVEMENTS,
  createGame,
  decideAssist,
  earnedAchievements,
  fire,
  isMode,
  nameError,
  normaliseName,
  publicGame,
  startGame,
  assistanceStatus,
  type AssistDecision,
  type GameState,
  type Mode,
} from '../src/engine/index.js';
import { db } from './db.js';
import { newRecoveryCode, newSeed, newToken, normaliseRecoveryCode, rateLimit, sha256 } from './security.js';

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: unknown;
  ip: string;
}
export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const ok = (body: unknown, status = 200, headers?: Record<string, string>): ApiResponse => ({ status, body, headers });

// ---------- sessions ----------
// The session token lives in an HttpOnly cookie so page scripts (and any XSS) can't read it.
// Bearer tokens are still accepted so browsers holding a pre-cookie localStorage token are migrated.

export const SESSION_COOKIE = 'bbf_session';
const SESSION_MAX_AGE = 400 * 24 * 3600;

function readCookie(req: ApiRequest, name: string): string {
  for (const part of (req.headers['cookie'] ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function sessionCookie(req: ApiRequest, token: string, maxAge = SESSION_MAX_AGE): Record<string, string> {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return { 'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}` };
}

function bearer(req: ApiRequest): string {
  const auth = req.headers['authorization'] ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PlayerRow {
  id: string;
  display_name: string;
  avatar: AvatarConfig | null;
}

async function authPlayer(req: ApiRequest): Promise<PlayerRow> {
  const cookie = readCookie(req, SESSION_COOKIE);
  const token = cookie || bearer(req);
  if (!token) throw new HttpError(401, 'unauthorised');
  // Cross-site forms can't send JSON without a CORS preflight, so this backs up SameSite=Lax against CSRF.
  if (cookie && req.method !== 'GET' && !(req.headers['content-type'] ?? '').includes('application/json')) {
    throw new HttpError(403, 'forbidden');
  }
  const [row] = await db()<PlayerRow[]>`select id, display_name, avatar from players where session_hash = ${sha256(token)}`;
  if (!row) throw new HttpError(401, 'unauthorised');
  return row;
}

async function limit(key: string, max: number, windowSeconds: number) {
  if (!(await rateLimit(key, max, windowSeconds))) throw new HttpError(429, 'rate_limited');
}

function body(req: ApiRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function validName(raw: unknown): string {
  const err = nameError(raw);
  if (err) throw new HttpError(400, `name_${err}`);
  return normaliseName(raw);
}

function validAvatar(raw: unknown): AvatarConfig | null {
  if (raw == null) return null;
  const a = parseAvatar(raw);
  if (!a) throw new HttpError(400, 'invalid_avatar');
  return a;
}

const isNameTaken = (e: unknown) => {
  const err = e as { code?: string; constraint_name?: string } | null;
  return err?.code === '23505' && err.constraint_name === 'players_name_key_idx';
};

const publicPlayer = (p: PlayerRow) => ({ id: p.id, displayName: p.display_name, avatar: p.avatar });

function testSeed(req: ApiRequest): number | null {
  const allowed = process.env.ALLOW_TEST_SEED === '1' && process.env.NODE_ENV !== 'production';
  const raw = req.headers['x-test-seed'];
  return allowed && raw && /^\d+$/.test(raw) ? Number(raw) >>> 0 : null;
}

// ---------- players ----------

async function createPlayer(req: ApiRequest) {
  await limit(`player:${sha256(req.ip)}`, 20, 3600);
  const b = body(req);
  const displayName = validName(b.displayName);
  const avatar = validAvatar(b.avatar);
  const token = newToken();
  const recoveryCode = newRecoveryCode();
  const [row] = await db()<PlayerRow[]>`
    insert into players (display_name, avatar, session_hash, recovery_hash)
    values (${displayName}, ${avatar ? db().json(avatar) : null}, ${sha256(token)}, ${sha256(normaliseRecoveryCode(recoveryCode))})
    returning id, display_name, avatar`.catch((e) => {
    throw isNameTaken(e) ? new HttpError(409, 'name_taken') : e;
  });
  return ok({ player: publicPlayer(row), recoveryCode }, 201, sessionCookie(req, token));
}

async function nameAvailable(req: ApiRequest) {
  await limit(`name-check:${sha256(req.ip)}`, 120, 3600);
  const displayName = validName(req.query.name);
  const [taken] = await db()`select 1 from players where name_key = lower(btrim(${displayName}))`;
  return ok({ available: !taken });
}

async function getMe(req: ApiRequest) {
  const p = await authPlayer(req);
  const achievements = await db()`select code, earned_at from achievements where player_id = ${p.id} order by earned_at`;
  const bests = await db()`
    select distinct on (mode) mode, human_turns, duration_ms, ended_at, assistance_status
    from games where player_id = ${p.id} and phase = 'won'
    order by mode, human_turns, duration_ms, ended_at`;
  const [totals] = await db()`
    select count(*) filter (where phase = 'won')::int as wins, count(*) filter (where phase = 'lost')::int as losses
    from games where player_id = ${p.id}`;
  const migrateBearer = !readCookie(req, SESSION_COOKIE) && bearer(req);
  return ok({
    player: publicPlayer(p),
    achievements: achievements.map((a) => ({ code: a.code, ...ACHIEVEMENTS[a.code as keyof typeof ACHIEVEMENTS], earnedAt: a.earned_at })),
    personalBests: bests.map((b) => ({ mode: b.mode, humanTurns: b.human_turns, durationMs: b.duration_ms, endedAt: b.ended_at, assistanceStatus: b.assistance_status })),
    totals,
  }, 200, migrateBearer ? sessionCookie(req, migrateBearer) : undefined);
}

async function updateMe(req: ApiRequest) {
  const p = await authPlayer(req);
  const b = body(req);
  const displayName = b.displayName !== undefined ? validName(b.displayName) : p.display_name;
  const avatar = b.avatar !== undefined ? validAvatar(b.avatar) : p.avatar;
  const [row] = await db()<PlayerRow[]>`
    update players set display_name = ${displayName}, avatar = ${avatar ? db().json(avatar) : null}, updated_at = now()
    where id = ${p.id} returning id, display_name, avatar`.catch((e) => {
    throw isNameTaken(e) ? new HttpError(409, 'name_taken') : e;
  });
  return ok({ player: publicPlayer(row) });
}

async function rotateRecoveryCode(req: ApiRequest) {
  const p = await authPlayer(req);
  await limit(`recovery-code:${p.id}`, 10, 3600);
  // Only the hash is stored, so the old code can't be shown again; issuing a new one retires it.
  const recoveryCode = newRecoveryCode();
  await db()`update players set recovery_hash = ${sha256(normaliseRecoveryCode(recoveryCode))}, updated_at = now() where id = ${p.id}`;
  return ok({ recoveryCode });
}

async function recover(req: ApiRequest) {
  await limit(`recover:${sha256(req.ip)}`, 10, 3600);
  const code = normaliseRecoveryCode(body(req).recoveryCode);
  if (code.length !== 24) throw new HttpError(400, 'invalid_recovery_code');
  const token = newToken();
  // Rotating the session hash signs out any other browser using the old token.
  const [row] = await db()<PlayerRow[]>`
    update players set session_hash = ${sha256(token)}, updated_at = now()
    where recovery_hash = ${sha256(code)} returning id, display_name, avatar`;
  if (!row) throw new HttpError(404, 'invalid_recovery_code');
  return ok({ player: publicPlayer(row) }, 200, sessionCookie(req, token));
}

// ---------- games ----------

interface GameRow {
  id: string;
  player_id: string;
  state: GameState;
}

async function createGameRoute(req: ApiRequest) {
  const p = await authPlayer(req);
  await limit(`game:${p.id}`, 40, 3600);
  await limit(`game-ip:${sha256(req.ip)}`, 120, 3600);
  const b = body(req);
  if (!isMode(b.mode)) throw new HttpError(400, 'invalid_mode');
  const result = createGame(b.mode as Mode, b.fleet as never, testSeed(req) ?? newSeed());
  if (!result.ok) throw new HttpError(400, `fleet_${result.error}`);
  const state = result.value;
  const [row] = await db().begin(async (tx) => {
    await tx`update games set phase = 'abandoned', ended_at = now() where player_id = ${p.id} and phase in ('briefing', 'playing')`;
    return tx<{ id: string }[]>`
      insert into games (player_id, mode, phase, state, assistance_status)
      values (${p.id}, ${state.mode}, ${state.phase}, ${tx.json(state as never)}, ${assistanceStatus(state)})
      returning id`;
  });
  return ok({ id: row.id, game: publicGame(state) }, 201);
}

/** Load a game row under a row lock (serialises rapid/duplicate requests) and apply `fn`. */
async function mutateGame<T>(req: ApiRequest, id: string, fn: (state: GameState, now: number) => { state: GameState; extra?: T }) {
  const p = await authPlayer(req);
  if (!UUID.test(id)) throw new HttpError(404, 'not_found');
  return db().begin(async (tx) => {
    const [row] = await tx<(GameRow & { phase: string })[]>`select id, player_id, phase, state from games where id = ${id} for update`;
    if (!row || row.player_id !== p.id) throw new HttpError(404, 'not_found');
    if (row.phase === 'abandoned') throw new HttpError(409, 'game_abandoned');
    const { state, extra } = fn(row.state, Date.now());
    const durationMs = state.startedAt != null && state.endedAt != null ? state.endedAt - state.startedAt : null;
    await tx`
      update games set state = ${tx.json(state as never)}, phase = ${state.phase}, human_turns = ${state.humanTurns},
        assistance_status = ${assistanceStatus(state)}, duration_ms = ${durationMs},
        ended_at = ${state.endedAt != null ? new Date(state.endedAt) : null}
      where id = ${id}`;
    let victory = null;
    if (state.phase === 'won' && row.state.phase !== 'won') victory = await recordVictory(tx, p.id, id, state);
    return { player: p, state, extra, victory };
  });
}

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new HttpError(409, r.error);
  return r.value;
}

async function recordVictory(tx: postgres.TransactionSql, playerId: string, gameId: string, state: GameState) {
  const codes = earnedAchievements(state);
  const newAchievements: string[] = [];
  for (const code of codes) {
    const inserted = await tx`insert into achievements (player_id, code, game_id) values (${playerId}, ${code}, ${gameId}) on conflict do nothing returning code`;
    if (inserted.length) newAchievements.push(code);
  }
  const durationMs = state.endedAt! - state.startedAt!;
  const [prev] = await tx`
    select human_turns, duration_ms from games
    where player_id = ${playerId} and mode = ${state.mode} and phase = 'won' and id <> ${gameId}
    order by human_turns, duration_ms limit 1`;
  const personalBest = !prev || state.humanTurns < prev.human_turns || (state.humanTurns === prev.human_turns && durationMs < prev.duration_ms);
  return {
    newAchievements: newAchievements.map((code) => ({ code, ...ACHIEVEMENTS[code as keyof typeof ACHIEVEMENTS] })),
    personalBest,
  };
}

async function rankOf(gameId: string) {
  const [row] = await db()`
    with ranked as (
      select id, mode, row_number() over (order by human_turns, duration_ms, ended_at, id) as overall,
        row_number() over (partition by mode order by human_turns, duration_ms, ended_at, id) as in_mode
      from games where phase = 'won')
    select overall::int, in_mode::int from ranked where id = ${gameId}`;
  return row ? { overall: row.overall, mode: row.in_mode } : null;
}

async function getGame(req: ApiRequest, id: string) {
  const p = await authPlayer(req);
  if (!UUID.test(id)) throw new HttpError(404, 'not_found');
  const [row] = await db()<GameRow[]>`select id, player_id, state from games where id = ${id}`;
  if (!row || row.player_id !== p.id) throw new HttpError(404, 'not_found');
  return ok({ id, game: publicGame(row.state), rank: row.state.phase === 'won' ? await rankOf(id) : null });
}

async function activeGame(req: ApiRequest) {
  const p = await authPlayer(req);
  const [row] = await db()<GameRow[]>`
    select id, player_id, state from games where player_id = ${p.id} and phase in ('briefing', 'playing')
    order by created_at desc limit 1`;
  return ok(row ? { id: row.id, game: publicGame(row.state) } : { id: null, game: null });
}

async function assistRoute(req: ApiRequest, id: string) {
  const decision = body(req).decision as AssistDecision;
  const r = await mutateGame(req, id, (s) => ({ state: unwrap(decideAssist(s, decision)) }));
  return ok({ id, game: publicGame(r.state) });
}

async function startRoute(req: ApiRequest, id: string) {
  const r = await mutateGame(req, id, (s, now) => ({ state: unwrap(startGame(s, now)) }));
  return ok({ id, game: publicGame(r.state) });
}

async function fireRoute(req: ApiRequest, id: string) {
  const b = body(req);
  const coord = { r: Number(b.r), c: Number(b.c) };
  const r = await mutateGame(req, id, (s, now) => {
    const out = unwrap(fire(s, coord, now));
    return { state: out.state, extra: { playerShot: out.playerShot, aiShot: out.aiShot } };
  });
  const rank = r.victory ? await rankOf(id) : null;
  return ok({ id, game: publicGame(r.state), ...r.extra, victory: r.victory ? { ...r.victory, rank } : null });
}

async function abandonRoute(req: ApiRequest, id: string) {
  const p = await authPlayer(req);
  if (!UUID.test(id)) throw new HttpError(404, 'not_found');
  await db()`update games set phase = 'abandoned', ended_at = now() where id = ${id} and player_id = ${p.id} and phase in ('briefing', 'playing')`;
  return ok({ id });
}

// ---------- leaderboard ----------

async function leaderboard(req: ApiRequest) {
  const mode = req.query.mode && req.query.mode !== 'overall' ? req.query.mode : null;
  if (mode && !isMode(mode)) throw new HttpError(400, 'invalid_mode');
  const lim = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const rows = await db()`
    select g.id, p.id as player_id, p.display_name, p.avatar, g.mode, g.assistance_status, g.human_turns, g.duration_ms, g.ended_at,
      row_number() over (order by g.human_turns, g.duration_ms, g.ended_at, g.id)::int as rank
    from games g join players p on p.id = g.player_id
    where g.phase = 'won' and (${mode}::text is null or g.mode = ${mode})
    order by rank limit ${lim}`;
  const [{ total }] = await db()`select count(*)::int as total from games where phase = 'won' and (${mode}::text is null or mode = ${mode})`;
  return ok({
    mode: mode ?? 'overall',
    total,
    entries: rows.map((r) => ({
      rank: r.rank,
      gameId: r.id,
      playerId: r.player_id,
      displayName: r.display_name,
      avatar: r.avatar,
      mode: r.mode,
      assistanceStatus: r.assistance_status,
      humanTurns: r.human_turns,
      durationMs: r.duration_ms,
      endedAt: r.ended_at,
    })),
  });
}

// ---------- router ----------

export async function handleApi(req: ApiRequest): Promise<ApiResponse> {
  const parts = req.path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const route = `${req.method} /${parts.map((p, i) => (i === 1 && parts[0] === 'games' && UUID.test(p) ? ':id' : p)).join('/')}`;
  const id = parts[1];
  try {
    switch (route) {
      case 'GET /health':
        return ok({ ok: true });
      case 'POST /players':
        return await createPlayer(req);
      case 'GET /players/available':
        return await nameAvailable(req);
      case 'GET /players/me':
        return await getMe(req);
      case 'PATCH /players/me':
        return await updateMe(req);
      case 'POST /players/me/recovery-code':
        return await rotateRecoveryCode(req);
      case 'POST /players/recover':
        return await recover(req);
      case 'POST /games':
        return await createGameRoute(req);
      case 'GET /games/active':
        return await activeGame(req);
      case 'GET /games/:id':
        return await getGame(req, id);
      case 'POST /games/:id/assist':
        return await assistRoute(req, id);
      case 'POST /games/:id/start':
        return await startRoute(req, id);
      case 'POST /games/:id/fire':
        return await fireRoute(req, id);
      case 'POST /games/:id/abandon':
        return await abandonRoute(req, id);
      case 'GET /leaderboard':
        return await leaderboard(req);
      default:
        return { status: 404, body: { error: 'not_found' } };
    }
  } catch (e) {
    if (e instanceof HttpError) {
      const stale = e.status === 401 && readCookie(req, SESSION_COOKIE);
      return { status: e.status, body: { error: e.code }, headers: stale ? sessionCookie(req, '', 0) : undefined };
    }
    console.error(e);
    return { status: 500, body: { error: 'server_error' } };
  }
}

export function clientIp(headers: Record<string, string | string[] | undefined>, fallback = 'unknown'): string {
  const xff = headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  const real = headers['x-real-ip'];
  return first || (Array.isArray(real) ? real[0] : real) || fallback;
}
