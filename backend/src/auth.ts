import type { Request, RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Db } from './db.js';
import { unauthorized } from './errors.js';

/** Welcome bonus granted to every new account (RON wallet credit and gift points). */
export const WELCOME_WALLET_BONUS = 200;
export const WELCOME_GIFT_POINTS = 50;

export interface Claims {
  iss: string;
  sub: string;
  email: string;
  name: string;
}

export type TokenVerifier = (token: string) => Promise<Claims>;

export interface AuthUser {
  id: string;
  role: 'customer' | 'admin';
  email: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

const ALLOWED_ALGS = ['RS256', 'PS256', 'ES256', 'EdDSA'];

/**
 * Verifies OpenID Connect access tokens (JWT) against the issuer's JWKS, discovered through
 * `/.well-known/openid-configuration`. Signature, issuer, audience and expiry are checked on every call.
 */
export const createOidcVerifier = (issuer: string, audience: string): TokenVerifier => {
  let keys: Promise<JWTVerifyGetKey> | undefined;
  const discover = async (): Promise<JWTVerifyGetKey> => {
    const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`OIDC discovery failed with status ${res.status}`);
    const doc = (await res.json()) as { jwks_uri?: string; issuer?: string };
    if (!doc.jwks_uri || doc.issuer !== issuer) throw new Error('OIDC discovery document does not match the configured issuer');
    return createRemoteJWKSet(new URL(doc.jwks_uri), { timeoutDuration: 5_000 });
  };

  return (token) => {
    keys ??= discover().catch((err) => {
      keys = undefined; // retry discovery on the next request
      throw err;
    });
    return keys.then((getKey) => verifyAccessToken(token, getKey, issuer, audience));
  };
};

/** Checks signature, issuer, audience and expiry, and extracts the identity claims. */
export const verifyAccessToken = async (
  token: string,
  getKey: JWTVerifyGetKey | CryptoKey,
  issuer: string,
  audience: string,
): Promise<Claims> => {
  const options = { issuer, audience, algorithms: ALLOWED_ALGS };
  const { payload } =
    typeof getKey === 'function' ? await jwtVerify(token, getKey, options) : await jwtVerify(token, getKey, options);
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!payload.sub || !email) throw new Error('Token is missing required claims');
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0]!;
  return { iss: issuer, sub: payload.sub, email, name: name.slice(0, 120) };
};

interface UserRow {
  id: string;
  role: 'customer' | 'admin';
  email: string;
  name: string;
}

/** Finds the local account for the token's subject, creating it (with the welcome bonus) on first sign-in. */
export const provisionUser = async (db: Db, claims: Claims): Promise<AuthUser> => {
  const [existing] = await db.query<UserRow>(
    'SELECT id, role, email, name FROM users WHERE oidc_issuer = $1 AND oidc_subject = $2',
    [claims.iss, claims.sub],
  );
  if (existing) {
    if (existing.email === claims.email && existing.name === claims.name) return existing;
    const [updated] = await db.query<UserRow>(
      'UPDATE users SET email = $3, name = $4 WHERE oidc_issuer = $1 AND oidc_subject = $2 RETURNING id, role, email, name',
      [claims.iss, claims.sub, claims.email, claims.name],
    );
    return updated!;
  }
  return db.transaction(async (tx) => {
    const [row] = await tx.query<UserRow & { inserted: boolean }>(
      `INSERT INTO users (oidc_issuer, oidc_subject, email, name, wallet_balance, gift_points)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (oidc_issuer, oidc_subject) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
       RETURNING id, role, email, name, (xmax = 0) AS inserted`,
      [claims.iss, claims.sub, claims.email, claims.name, WELCOME_WALLET_BONUS, WELCOME_GIFT_POINTS],
    );
    if (row!.inserted) {
      await tx.query(`INSERT INTO wallet_transactions (user_id, reason, amount) VALUES ($1, 'top_up', $2)`, [
        row!.id,
        WELCOME_WALLET_BONUS,
      ]);
      await tx.query(`INSERT INTO gift_point_transactions (user_id, reason, points) VALUES ($1, 'earned', $2)`, [
        row!.id,
        WELCOME_GIFT_POINTS,
      ]);
    }
    const { inserted: _inserted, ...user } = row!;
    return user;
  });
};

const bearer = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token, extra] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : undefined;
};

/** Requires a valid access token on every request; no session or client-side trust. */
export const requireAuth = (db: Db, verify: TokenVerifier): RequestHandler => async (req, res, next) => {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  let claims: Claims;
  try {
    claims = await verify(token);
  } catch {
    res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
    return next(unauthorized());
  }
  req.user = await provisionUser(db, claims);
  next();
};

export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
