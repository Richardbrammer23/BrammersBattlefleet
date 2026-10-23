import type { AvatarConfig } from './avatar/options';
import type { AssistDecision, Coord, Fleet, Mode, PublicGame, Shot } from './engine';

const TOKEN_KEY = 'bbf.token';

export interface Player {
  id: string;
  displayName: string;
  avatar: AvatarConfig | null;
}
export interface Achievement {
  code: string;
  name: string;
  description: string;
  earnedAt?: string;
}
export interface PersonalBest {
  mode: Mode;
  humanTurns: number;
  durationMs: number;
  endedAt: string;
  assistanceStatus: string;
}
export interface Profile {
  player: Player;
  achievements: Achievement[];
  personalBests: PersonalBest[];
  totals: { wins: number; losses: number };
}
export interface LeaderboardEntry {
  rank: number;
  gameId: string;
  playerId: string;
  displayName: string;
  avatar: AvatarConfig | null;
  mode: Mode;
  assistanceStatus: string;
  humanTurns: number;
  durationMs: number;
  endedAt: string;
}
export interface Leaderboard {
  mode: Mode | 'overall';
  total: number;
  entries: LeaderboardEntry[];
}
export interface Victory {
  newAchievements: Achievement[];
  personalBest: boolean;
  rank: { overall: number; mode: number } | null;
}
export interface GameResponse {
  id: string;
  game: PublicGame;
}
export interface FireResponse extends GameResponse {
  playerShot: Shot;
  aiShot: Shot | null;
  victory: Victory | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

// Sessions use an HttpOnly cookie set by the server. A token left in localStorage by an older
// build is sent once as a Bearer header so the server can move it into the cookie, then removed.
const legacyToken = () => localStorage.getItem(TOKEN_KEY);
export const clearLegacyToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = legacyToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const seed = sessionStorage.getItem('bbf.testSeed');
  if (seed) headers['X-Test-Seed'] = seed;
  if (sessionStorage.getItem('bbf.fastAi') === '1') headers['X-Test-Fast-Turns'] = '1';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'server_error');
  return data as T;
}

export const api = {
  createPlayer: (displayName: string, avatar: AvatarConfig | null) =>
    request<{ player: Player; recoveryCode: string }>('POST', '/players', { displayName, avatar }),
  nameAvailable: (name: string) => request<{ available: boolean }>('GET', `/players/available?name=${encodeURIComponent(name)}`),
  me: () => request<Profile>('GET', '/players/me'),
  updateMe: (patch: { displayName?: string; avatar?: AvatarConfig | null }) => request<{ player: Player }>('PATCH', '/players/me', patch),
  newRecoveryCode: () => request<{ recoveryCode: string }>('POST', '/players/me/recovery-code', {}),
  recover: (recoveryCode: string) => request<{ player: Player }>('POST', '/players/recover', { recoveryCode }),
  createGame: (mode: Mode, fleet: Fleet) => request<GameResponse>('POST', '/games', { mode, fleet }),
  activeGame: () => request<{ id: string | null; game: PublicGame | null }>('GET', '/games/active'),
  getGame: (id: string) => request<GameResponse & { rank: Victory['rank'] }>('GET', `/games/${id}`),
  assist: (id: string, decision: AssistDecision) => request<GameResponse>('POST', `/games/${id}/assist`, { decision }),
  start: (id: string) => request<GameResponse>('POST', `/games/${id}/start`),
  fire: (id: string, p: Coord) => request<FireResponse>('POST', `/games/${id}/fire`, p),
  abandon: (id: string) => request<{ id: string }>('POST', `/games/${id}/abandon`),
  leaderboard: (mode: Mode | 'overall', limit = 10) => request<Leaderboard>('GET', `/leaderboard?mode=${mode}&limit=${limit}`),
};

export const NAME_TAKEN_MESSAGE =
  "This captain's name is already registered. Please choose another username or sign in to your existing profile.";

const MESSAGES: Record<string, string> = {
  network_error: 'Connection lost. Check your network and try again.',
  rate_limited: 'Too many requests — please wait a moment.',
  name_too_short: 'Name must be at least 2 characters.',
  name_too_long: 'Name must be 15 characters or fewer.',
  name_invalid_characters: 'Use letters, numbers, spaces, . _ \' or - only.',
  name_not_allowed: 'Please choose a different name.',
  name_taken: NAME_TAKEN_MESSAGE,
  invalid_recovery_code: 'That recovery code was not recognised.',
  unauthorised: 'You are signed out. Sign in with your recovery code or create a profile.',
  forbidden: 'That request was blocked. Please reload the page.',
  game_abandoned: 'This game was replaced by a newer one.',
  too_fast: 'Captain Brammer is still taking his turn. Try again in a moment.',
};
export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? (MESSAGES[e.code] ?? `Something went wrong (${e.code}).`) : 'Something went wrong.';
