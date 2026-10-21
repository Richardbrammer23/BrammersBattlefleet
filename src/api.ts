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

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const seed = sessionStorage.getItem('bbf.testSeed');
  if (seed) headers['X-Test-Seed'] = seed;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'server_error');
  return data as T;
}

export const api = {
  createPlayer: (displayName: string, avatar: AvatarConfig | null) =>
    request<{ player: Player; token: string; recoveryCode: string }>('POST', '/players', { displayName, avatar }),
  me: () => request<Profile>('GET', '/players/me'),
  updateMe: (patch: { displayName?: string; avatar?: AvatarConfig | null }) => request<{ player: Player }>('PATCH', '/players/me', patch),
  recover: (recoveryCode: string) => request<{ player: Player; token: string }>('POST', '/players/recover', { recoveryCode }),
  createGame: (mode: Mode, fleet: Fleet) => request<GameResponse>('POST', '/games', { mode, fleet }),
  activeGame: () => request<{ id: string | null; game: PublicGame | null }>('GET', '/games/active'),
  getGame: (id: string) => request<GameResponse & { rank: Victory['rank'] }>('GET', `/games/${id}`),
  assist: (id: string, decision: AssistDecision) => request<GameResponse>('POST', `/games/${id}/assist`, { decision }),
  start: (id: string) => request<GameResponse>('POST', `/games/${id}/start`),
  fire: (id: string, p: Coord) => request<FireResponse>('POST', `/games/${id}/fire`, p),
  abandon: (id: string) => request<{ id: string }>('POST', `/games/${id}/abandon`),
  leaderboard: (mode: Mode | 'overall', limit = 10) => request<Leaderboard>('GET', `/leaderboard?mode=${mode}&limit=${limit}`),
};

const MESSAGES: Record<string, string> = {
  network_error: 'Connection lost. Check your network and try again.',
  rate_limited: 'Too many requests — please wait a moment.',
  name_too_short: 'Name must be at least 2 characters.',
  name_too_long: 'Name must be 15 characters or fewer.',
  name_invalid_characters: 'Use letters, numbers, spaces, . _ \' or - only.',
  name_not_allowed: 'Please choose a different name.',
  invalid_recovery_code: 'That recovery code was not recognised.',
  unauthorised: 'Your session expired. Please set up your profile again.',
  game_abandoned: 'This game was replaced by a newer one.',
};
export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? (MESSAGES[e.code] ?? `Something went wrong (${e.code}).`) : 'Something went wrong.';
