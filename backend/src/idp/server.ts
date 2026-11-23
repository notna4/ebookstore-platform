// Local OpenID Connect provider for development and demos (node-oidc-provider on loopback).
// It stands in for a corporate identity provider: point OIDC_ISSUER at the real one and this file is not needed.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, type JWK } from 'jose';
import Provider, { errors, type Configuration } from 'oidc-provider';
import { createLogger } from '../logger.js';

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
};

const issuer = required('OIDC_ISSUER');
const audience = process.env.OIDC_AUDIENCE ?? 'urn:bookworm:api';
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';
const demoPassword = required('IDP_DEMO_PASSWORD');
const tlsKeyFile = process.env.TLS_KEY_FILE;
const tlsCertFile = process.env.TLS_CERT_FILE;
const { hostname, port } = new URL(issuer);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
  throw new Error('The local identity provider only runs on a loopback issuer URL');
}

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');

/** Demo accounts; the shared password comes from IDP_DEMO_PASSWORD, never from source. */
const accounts: Record<string, { email: string; name: string }> = {
  'demo-maria': { email: 'maria.popescu@example.com', name: 'Maria Popescu' },
  'demo-andrei': { email: 'andrei.ionescu@example.com', name: 'Andrei Ionescu' },
};
const accountIdByEmail = new Map(Object.entries(accounts).map(([id, a]) => [a.email, id]));

const digest = (s: string) => createHash('sha256').update(s).digest();
const passwordMatches = (candidate: string) => timingSafeEqual(digest(candidate), digest(demoPassword));

// Signing key is persisted so tokens stay valid across restarts.
const loadSigningKey = async (): Promise<JWK> => {
  const file = fileURLToPath(new URL('../../.data/idp-signing-key.json', import.meta.url));
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as JWK;
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  const key: JWK = { ...jwk, kid: await calculateJwkThumbprint(jwk), alg: 'RS256', use: 'sig' };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(key), { mode: 0o600 });
  return key;
};

const findAccount: Configuration['findAccount'] = async (_ctx, id) => {
  const account = accounts[id];
  if (!account) return undefined;
  return {
    accountId: id,
    claims: async () => ({ sub: id, email: account.email, email_verified: true, name: account.name }),
  };
};

const configuration: Configuration = {
  clients: [
    {
      client_id: 'bookworm-spa',
      // Public client: no secret, PKCE is mandatory.
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      redirect_uris: [`${frontendOrigin}/auth/callback`],
      post_logout_redirect_uris: [`${frontendOrigin}/`],
    },
  ],
  jwks: { keys: [(await loadSigningKey()) as never] },
  cookies: { keys: [process.env.IDP_COOKIE_KEY ?? randomBytes(32).toString('hex')] },
  findAccount,
  claims: { openid: ['sub'], email: ['email', 'email_verified'], profile: ['name'] },
  pkce: { required: () => true },
  ttl: { AccessToken: 3600, IdToken: 3600, Session: 8 * 3600, Interaction: 600, Grant: 8 * 3600, AuthorizationCode: 60 },
  interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
  clientBasedCORS: (_ctx, origin, client) => client.clientId === 'bookworm-spa' && origin === frontendOrigin,
  features: {
    devInteractions: { enabled: false },
    resourceIndicators: {
      enabled: true,
      defaultResource: () => audience,
      useGrantedResource: () => true,
      getResourceServerInfo: (_ctx, indicator) => {
        if (indicator !== audience) throw new errors.InvalidTarget();
        return { scope: '', audience, accessTokenFormat: 'jwt', accessTokenTTL: 3600, jwt: { sign: { alg: 'RS256' } } };
      },
    },
  },
  // Put identity claims in the JWT access token so the API can provision the account.
  extraTokenClaims: async (ctx, token) => {
    const accountId = 'accountId' in token ? token.accountId : undefined;
    const account = accountId ? await findAccount(ctx, accountId) : undefined;
    const claims = await account?.claims('id_token', 'openid email profile', {}, []);
    return claims ? { email: claims.email, name: claims.name } : undefined;
  },
};

const provider = new Provider(issuer, configuration);

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const loginPage = (uid: string, error?: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sign in · Book Worm</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#161616;color:#f4f4f4;display:grid;place-items:center;min-height:100vh;margin:0}
  form{background:#262626;padding:2rem;width:min(22rem,90vw);display:grid;gap:1rem}
  h1{font-size:1.25rem;margin:0;font-weight:400}
  label{display:grid;gap:.25rem;font-size:.875rem;color:#c6c6c6}
  input{padding:.75rem;background:#393939;border:0;border-bottom:1px solid #8d8d8d;color:#f4f4f4;font-size:1rem}
  button{padding:.9rem;background:#0f62fe;color:#fff;border:0;font-size:1rem;cursor:pointer}
  .err{color:#ff8389;font-size:.875rem;margin:0}
  small{color:#a8a8a8}
</style></head><body>
<form method="post" action="/interaction/${escapeHtml(uid)}/login">
  <h1>Sign in to Book Worm</h1>
  ${error ? `<p class="err" role="alert">${escapeHtml(error)}</p>` : ''}
  <label>Email<input name="email" type="email" autocomplete="username" required autofocus></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
  <small>Local demo identity provider. Demo users: ${Object.values(accounts).map((a) => escapeHtml(a.email)).join(', ')}</small>
</form></body></html>`;

// ---------------------------------------------------------------------------
// HTTP app
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    // Chrome applies form-action to the redirect that follows a login POST, which would block the callback.
    contentSecurityPolicy: { directives: { 'form-action': null, 'style-src': ["'self'", "'unsafe-inline'"] } },
  }),
);

const noCache = (_req: Request, res: Response, next: () => void) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => void res.status(429).type('text/plain').send('Too many sign-in attempts. Try again in a minute.'),
});

app.get('/interaction/:uid', noCache, async (req, res, next) => {
  try {
    const interaction = await provider.interactionDetails(req, res);
    if (interaction.prompt.name === 'login') {
      res.type('html').send(loginPage(interaction.uid));
      return;
    }
    // First-party client: consent is granted automatically for the requested scopes.
    const { prompt, params, session, grantId } = interaction;
    const grant = grantId
      ? await provider.Grant.find(grantId)
      : new provider.Grant({ accountId: session!.accountId, clientId: params.client_id as string });
    const details = prompt.details as {
      missingOIDCScope?: string[];
      missingOIDCClaims?: string[];
      missingResourceScopes?: Record<string, string[]>;
    };
    if (details.missingOIDCScope) grant!.addOIDCScope(details.missingOIDCScope.join(' '));
    if (details.missingOIDCClaims) grant!.addOIDCClaims(details.missingOIDCClaims);
    for (const [indicator, scopes] of Object.entries(details.missingResourceScopes ?? {})) {
      grant!.addResourceScope(indicator, scopes.join(' '));
    }
    await provider.interactionFinished(req, res, { consent: { grantId: await grant!.save() } }, { mergeWithLastSubmission: true });
  } catch (err) {
    next(err);
  }
});

app.post('/interaction/:uid/login', noCache, loginLimiter, express.urlencoded({ extended: false, limit: '4kb' }), async (req, res, next) => {
  try {
    const interaction = await provider.interactionDetails(req, res);
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const accountId = accountIdByEmail.get(email);
    if (!accountId || !passwordMatches(password)) {
      logger.warn({ event: 'login_failed' }, 'Sign-in rejected');
      res.status(401).type('html').send(loginPage(interaction.uid, 'Invalid email or password.'));
      return;
    }
    logger.info({ event: 'login_succeeded', accountId }, 'Sign-in accepted');
    await provider.interactionFinished(req, res, { login: { accountId } }, { mergeWithLastSubmission: false });
  } catch (err) {
    next(err);
  }
});

app.use(provider.callback());

const server =
  tlsKeyFile && tlsCertFile
    ? createHttpsServer({ key: readFileSync(tlsKeyFile), cert: readFileSync(tlsCertFile), minVersion: 'TLSv1.2' }, app)
    : createHttpServer(app);

server.listen(Number(port), hostname === 'localhost' ? 'localhost' : '127.0.0.1', () => {
  logger.info({ issuer, audience }, 'Local OpenID Connect provider listening');
});
