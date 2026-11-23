import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { SignJWT, generateKeyPair } from 'jose';
import { pino } from 'pino';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { verifyAccessToken } from '../src/auth.js';
import type { Db } from '../src/db.js';

export const ISSUER = 'https://idp.test.local';
export const AUDIENCE = 'bookworm-api';

const sql = (file: string) => readFileSync(fileURLToPath(new URL(`../../database/${file}`, import.meta.url)), 'utf8');

/** In-process PostgreSQL (PGlite) with the real schema and seed loaded. */
export const createTestDb = async (): Promise<Db> => {
  const pg = new PGlite();
  await pg.exec(sql('schema.sql'));
  await pg.exec(sql('seed.sql'));
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query(text, params)).rows as T[],
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: async <T>(text: string, params: unknown[] = []) => (await tx.query(text, params)).rows as T[] })),
    close: () => pg.close(),
  };
};

export interface TestContext {
  db: Db;
  server: Server;
  api: ReturnType<typeof request>;
  /** Creates a signed access token for a brand-new user (or an existing one when `sub` is given). */
  login: (claims?: { sub?: string; email?: string; name?: string }) => Promise<Session>;
  sign: (claims: Record<string, unknown>, opts?: { issuer?: string; audience?: string; expiresIn?: string }) => Promise<string>;
  close: () => Promise<void>;
}

export interface Session {
  token: string;
  sub: string;
  auth: { Authorization: string };
}

export const createTestContext = async (appOptions: { pendingOrderTtlMinutes?: number; rateLimitPerMinute?: number } = {}): Promise<TestContext> => {
  const db = await createTestDb();
  const { publicKey, privateKey } = await generateKeyPair('RS256');

  const sign: TestContext['sign'] = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '5m')
      .sign(privateKey);

  const app = createApp({
    db,
    verifier: (token) => verifyAccessToken(token, publicKey, ISSUER, AUDIENCE),
    logger: pino({ level: 'silent' }),
    corsOrigins: ['http://127.0.0.1:5173'],
    rateLimitPerMinute: 100_000,
    ...appOptions,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  return {
    db,
    server,
    api: request(server),
    sign,
    login: async (claims = {}) => {
      const sub = claims.sub ?? randomUUID();
      const token = await sign({ sub, email: claims.email ?? `${sub}@example.com`, name: claims.name ?? 'Test Reader' });
      return { token, sub, auth: { Authorization: `Bearer ${token}` } };
    },
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
};

export const validAddress = {
  firstName: 'Ana',
  lastName: 'Ionescu',
  line1: 'Strada Lipscani 10',
  email: 'ana@example.com',
  city: 'București',
  postalCode: '030031',
  phoneCode: '+40',
  phone: '712345678',
  county: 'București',
  country: 'Romania',
};
