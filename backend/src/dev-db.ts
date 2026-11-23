// Embedded PostgreSQL (PGlite) served on loopback, for running the stack without installing PostgreSQL.
// Development only: the data lives in backend/.data/pgdata and the socket has no authentication.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const file = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const port = Number(process.env.DEV_DB_PORT ?? 5432);

const dataDir = file('../.data/pgdata');
mkdirSync(dataDir, { recursive: true });
const db = await PGlite.create(dataDir);

const { rows } = await db.query<{ exists: boolean }>("SELECT to_regclass('public.users') IS NOT NULL AS exists");
if (!rows[0]?.exists) {
  await db.exec(readFileSync(file('../../database/schema.sql'), 'utf8'));
  await db.exec(readFileSync(file('../../database/seed.sql'), 'utf8'));
  console.log('Schema created and catalogue seeded.');
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`Embedded PostgreSQL listening on 127.0.0.1:${port} (development only)`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
