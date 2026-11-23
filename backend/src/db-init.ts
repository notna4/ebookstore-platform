// Creates the schema and loads the catalogue seed: `npm run db:init` (requires DATABASE_URL).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Missing required environment variable DATABASE_URL');

const read = (file: string) => readFileSync(fileURLToPath(new URL(`../../database/${file}`, import.meta.url)), 'utf8');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query<{ exists: boolean }>("SELECT to_regclass('public.users') IS NOT NULL AS exists");
  if (rows[0]?.exists) {
    console.log('Schema already present; nothing to do.');
  } else {
    await client.query(read('schema.sql'));
    await client.query(read('seed.sql'));
    console.log('Schema created and catalogue seeded.');
  }
} finally {
  await client.end();
}
