// Applies server/schema.sql. `--schema preview` applies it to the isolated preview schema instead,
// with the same role/schema substitutions as scripts/create-preview-db.ts.
import { readFileSync } from 'node:fs';
import { closeDb, db } from '../server/db.js';

let sql = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
const preview = process.argv.includes('--schema') && process.argv[process.argv.indexOf('--schema') + 1] === 'preview';
if (preview) {
  sql = sql
    .replaceAll('battlefleet_app', 'battlefleet_preview')
    .replaceAll('schema public', 'schema preview')
    .replaceAll("schemaname = 'public'", "schemaname = 'preview'");
}
await db().begin(async (tx) => {
  if (preview) await tx.unsafe('set local search_path = preview, public');
  await tx.unsafe(sql);
});
console.log(`Schema applied${preview ? ' to preview' : ''}.`);
await closeDb();
