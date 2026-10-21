// Creates (or re-passwords) the least-privilege `battlefleet_app` login role, then re-applies
// the schema so its grants and RLS policies exist. Run with an admin DATABASE_URL and
// APP_DB_PASSWORD in the environment; the password is never logged.
import { readFileSync } from 'node:fs';
import { closeDb, db } from '../server/db.js';

const password = process.env.APP_DB_PASSWORD;
if (!password || !/^[A-Za-z0-9]{24,}$/.test(password)) {
  throw new Error('APP_DB_PASSWORD must be 24+ alphanumeric characters');
}
const sql = db();
const [exists] = await sql`select 1 from pg_roles where rolname = 'battlefleet_app'`;
await sql.unsafe(
  `${exists ? 'alter' : 'create'} role battlefleet_app with login noinherit nocreatedb nocreaterole password '${password}'`,
);
await sql.unsafe(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
console.log(`battlefleet_app role ${exists ? 'updated' : 'created'}; schema applied.`);
await closeDb();
