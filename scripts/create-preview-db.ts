// Creates an isolated `preview` schema and a least-privilege `battlefleet_preview` login for
// Vercel Preview deployments, so preview games never touch the production tables or leaderboard.
// Run with an admin DATABASE_URL and PREVIEW_DB_PASSWORD in the environment; the password is never logged.
import { readFileSync } from 'node:fs';
import { closeDb, db } from '../server/db.js';

const password = process.env.PREVIEW_DB_PASSWORD;
if (!password || !/^[A-Za-z0-9]{24,}$/.test(password)) {
  throw new Error('PREVIEW_DB_PASSWORD must be 24+ alphanumeric characters');
}
const sql = db();
const [exists] = await sql`select 1 from pg_roles where rolname = 'battlefleet_preview'`;
await sql.unsafe(
  `${exists ? 'alter' : 'create'} role battlefleet_preview with login noinherit nocreatedb nocreaterole password '${password}'`,
);
await sql.unsafe('create schema if not exists preview');
await sql.unsafe('revoke all on schema preview from public');
await sql.unsafe('alter role battlefleet_preview set search_path = preview');
const schema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8')
  .replaceAll('battlefleet_app', 'battlefleet_preview')
  .replaceAll('schema public', 'schema preview')
  .replaceAll("schemaname = 'public'", "schemaname = 'preview'");
await sql.begin(async (tx) => {
  await tx.unsafe('set local search_path = preview, public');
  await tx.unsafe(schema);
});
console.log(`battlefleet_preview role ${exists ? 'updated' : 'created'}; preview schema applied.`);
await closeDb();
