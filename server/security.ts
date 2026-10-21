import { createHash, randomBytes, randomInt } from 'node:crypto';
import { db } from './db.js';

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** 24 Crockford base32 characters = 120 bits, grouped for readability. */
export function newRecoveryCode(): string {
  const chars = Array.from({ length: 24 }, () => CROCKFORD[randomInt(32)]).join('');
  return chars.match(/.{4}/g)!.join('-');
}
export function normaliseRecoveryCode(code: unknown): string {
  return typeof code === 'string'
    ? code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
    : '';
}

export function newSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

/** Fixed-window rate limit stored in Postgres. Returns true if the request is allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await db()`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  if (Math.random() < 0.02) await db()`delete from rate_limits where window_start < now() - interval '1 day'`;
  return row.count <= limit;
}
