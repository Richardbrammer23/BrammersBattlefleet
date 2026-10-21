import { readFileSync } from 'node:fs';
import { closeDb, db } from '../server/db.js';

const sql = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
await db().unsafe(sql);
console.log('Schema applied.');
await closeDb();
