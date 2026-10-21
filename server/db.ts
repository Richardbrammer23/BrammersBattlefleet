import postgres from 'postgres';

let client: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured');
    // prepare:false keeps us compatible with Supabase's transaction-mode pooler.
    client = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  }
  return client;
}

export async function closeDb() {
  await client?.end({ timeout: 5 });
  client = null;
}
