import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

describe('authentication', () => {
  it('rejects requests without a token with a generic problem response', async () => {
    const res = await ctx.api.get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ title: 'Unauthorized', status: 401 });
  });

  it('rejects a malformed token', async () => {
    const res = await ctx.api.get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('invalid_token');
  });

  it('rejects a token with the wrong audience, issuer or expiry', async () => {
    const claims = { sub: 'u-1', email: 'a@example.com', name: 'A' };
    for (const opts of [{ audience: 'someone-else' }, { issuer: 'https://evil.example' }, { expiresIn: '-1m' }]) {
      const token = await ctx.sign(claims, opts);
      const res = await ctx.api.get('/api/v1/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a token signed with another key', async () => {
    const other = await createTestContext();
    const forged = await other.login();
    const res = await ctx.api.get('/api/v1/me').set(forged.auth);
    expect(res.status).toBe(401);
    await other.close();
  });

  it('rejects a token that lacks an email claim', async () => {
    const token = await ctx.sign({ sub: 'no-email' });
    const res = await ctx.api.get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('creates the account on first sign-in with the welcome bonus, once', async () => {
    const s = await ctx.login({ name: 'Maria Popescu', email: 'maria@example.com' });
    const first = await ctx.api.get('/api/v1/me').set(s.auth);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ name: 'Maria Popescu', email: 'maria@example.com', walletBalance: 200, giftPoints: 50 });

    await ctx.api.get('/api/v1/me').set(s.auth);
    const again = await ctx.api.get('/api/v1/me').set(s.auth);
    expect(again.body).toMatchObject({ walletBalance: 200, giftPoints: 50 });
    expect(again.body.id).toBe(first.body.id);

    const ledger = await ctx.api.get('/api/v1/me/wallet/transactions').set(s.auth);
    expect(ledger.body.items).toHaveLength(1);
    expect(ledger.body.items[0]).toMatchObject({ reason: 'top_up', amount: 200 });
  });

  it('gives each user an isolated account', async () => {
    const a = await ctx.login();
    const b = await ctx.login();
    const ra = await ctx.api.get('/api/v1/me').set(a.auth);
    const rb = await ctx.api.get('/api/v1/me').set(b.auth);
    expect(ra.body.id).not.toBe(rb.body.id);
  });
});

describe('error handling', () => {
  it('returns 404 problem details for unknown routes', async () => {
    const res = await ctx.api.get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('returns a generic 400 for malformed JSON without echoing the input', async () => {
    const s = await ctx.login();
    const res = await ctx.api.post('/api/v1/checkout/quote').set(s.auth).set('Content-Type', 'application/json').send('{"bad":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('bad');
    expect(res.body.stack).toBeUndefined();
  });

  it('sets security headers and hides the framework', async () => {
    const res = await ctx.api.get('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('only allows the configured CORS origin', async () => {
    const ok = await ctx.api.get('/api/v1/categories').set('Origin', 'http://127.0.0.1:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    const other = await ctx.api.get('/api/v1/categories').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('answers 429 problem details once the limit is exceeded', async () => {
    const limited = await createTestContext({ rateLimitPerMinute: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await limited.api.get('/api/v1/categories')).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    const res = await limited.api.get('/api/v1/categories');
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.title).toBe('Too many requests');
    await limited.close();
  });
});
