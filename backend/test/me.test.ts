import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, validAddress, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

const url = (path: string) => `/api/v1/me${path}`;

describe('every /me endpoint requires authentication', () => {
  it.each([
    ['get', ''],
    ['get', '/cart'],
    ['get', '/wishlist'],
    ['get', '/writers'],
    ['get', '/addresses'],
    ['get', '/recommendations'],
    ['get', '/wallet/transactions'],
    ['delete', '/cart'],
  ] as const)('%s /me%s', async (method, path) => {
    expect((await ctx.api[method](url(path))).status).toBe(401);
  });
});

describe('addresses', () => {
  it('creates, lists, updates and deletes addresses', async () => {
    const s = await ctx.login();
    const created = await ctx.api.post(url('/addresses')).set(s.auth).send({ ...validAddress, isDefault: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ postalCode: '030031', phone: '712345678', county: 'București', isDefault: true });

    const list = await ctx.api.get(url('/addresses')).set(s.auth);
    expect(list.body).toHaveLength(1);

    const updated = await ctx.api.put(url(`/addresses/${created.body.id}`)).set(s.auth).send({ ...validAddress, city: 'Cluj-Napoca', isDefault: true });
    expect(updated.status).toBe(200);
    expect(updated.body.city).toBe('Cluj-Napoca');

    expect((await ctx.api.delete(url(`/addresses/${created.body.id}`)).set(s.auth)).status).toBe(204);
    expect((await ctx.api.delete(url(`/addresses/${created.body.id}`)).set(s.auth)).status).toBe(404);
  });

  it('keeps a single default address', async () => {
    const s = await ctx.login();
    const a = await ctx.api.post(url('/addresses')).set(s.auth).send({ ...validAddress, isDefault: true });
    const b = await ctx.api.post(url('/addresses')).set(s.auth).send({ ...validAddress, line1: 'Strada Mare 5', isDefault: true });
    const list = (await ctx.api.get(url('/addresses')).set(s.auth)).body as { id: string; isDefault: boolean }[];
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.body.id]);
    expect(list.map((x) => x.id)).toContain(a.body.id);
  });

  it('validates Romanian address fields', async () => {
    const s = await ctx.login();
    const post = (patch: object) => ctx.api.post(url('/addresses')).set(s.auth).send({ ...validAddress, ...patch });
    const bad = await post({ postalCode: '12345', phone: '0712345678', email: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['email', 'phone', 'postalCode']);
    expect((await post({ firstName: '' })).status).toBe(400);
    expect((await post({ unexpected: 1 })).status).toBe(400);
  });

  it("never exposes or changes another user's address", async () => {
    const owner = await ctx.login();
    const intruder = await ctx.login();
    const a = await ctx.api.post(url('/addresses')).set(owner.auth).send(validAddress);
    expect((await ctx.api.get(url('/addresses')).set(intruder.auth)).body).toHaveLength(0);
    expect((await ctx.api.put(url(`/addresses/${a.body.id}`)).set(intruder.auth).send(validAddress)).status).toBe(404);
    expect((await ctx.api.delete(url(`/addresses/${a.body.id}`)).set(intruder.auth)).status).toBe(404);
    expect((await ctx.api.get(url('/addresses')).set(owner.auth)).body).toHaveLength(1);
  });

  it('rejects a malformed address id', async () => {
    const s = await ctx.login();
    expect((await ctx.api.delete(url('/addresses/not-a-uuid')).set(s.auth)).status).toBe(400);
  });
});

describe('cart', () => {
  it('adds, updates, removes and clears items with totals', async () => {
    const s = await ctx.login();
    expect((await ctx.api.get(url('/cart')).set(s.auth)).body).toMatchObject({ items: [], itemCount: 0, subtotal: 0 });

    const one = await ctx.api.put(url('/cart/items/joy-of-minimalism')).set(s.auth).send({ quantity: 2 });
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ itemCount: 2, subtotal: 60 });
    expect(one.body.items[0]).toMatchObject({ quantity: 2, lineTotal: 60 });
    expect(one.body.items[0].book.id).toBe('joy-of-minimalism');

    const two = await ctx.api.put(url('/cart/items/the-path-to-success')).set(s.auth).send({ quantity: 1 });
    expect(two.body).toMatchObject({ itemCount: 3, subtotal: 130 });

    const changed = await ctx.api.put(url('/cart/items/joy-of-minimalism')).set(s.auth).send({ quantity: 1 });
    expect(changed.body).toMatchObject({ itemCount: 2, subtotal: 100 });

    const removed = await ctx.api.delete(url('/cart/items/joy-of-minimalism')).set(s.auth);
    expect(removed.body).toMatchObject({ itemCount: 1, subtotal: 70 });

    expect((await ctx.api.delete(url('/cart')).set(s.auth)).status).toBe(204);
    expect((await ctx.api.get(url('/cart')).set(s.auth)).body.itemCount).toBe(0);
  });

  it('enforces quantity 1–10 and known books', async () => {
    const s = await ctx.login();
    const put = (id: string, body: unknown) => ctx.api.put(url(`/cart/items/${id}`)).set(s.auth).send(body as object);
    expect((await put('joy-of-minimalism', { quantity: 0 })).status).toBe(400);
    expect((await put('joy-of-minimalism', { quantity: 11 })).status).toBe(400);
    expect((await put('joy-of-minimalism', { quantity: 1.5 })).status).toBe(400);
    expect((await put('joy-of-minimalism', { quantity: '2' })).status).toBe(400);
    expect((await put('joy-of-minimalism', {})).status).toBe(400);
    expect((await put('no-such-book', { quantity: 1 })).status).toBe(404);
  });

  it('keeps carts private to each user', async () => {
    const a = await ctx.login();
    const b = await ctx.login();
    await ctx.api.put(url('/cart/items/joy-of-minimalism')).set(a.auth).send({ quantity: 1 });
    expect((await ctx.api.get(url('/cart')).set(b.auth)).body.itemCount).toBe(0);
  });
});

describe('wishlist and followed writers', () => {
  it('adds and removes wishlist books idempotently', async () => {
    const s = await ctx.login();
    expect((await ctx.api.put(url('/wishlist/act-three')).set(s.auth)).status).toBe(204);
    expect((await ctx.api.put(url('/wishlist/act-three')).set(s.auth)).status).toBe(204);
    const list = await ctx.api.get(url('/wishlist')).set(s.auth);
    expect(list.body.map((b: { id: string }) => b.id)).toEqual(['act-three']);
    expect((await ctx.api.put(url('/wishlist/nope')).set(s.auth)).status).toBe(404);
    expect((await ctx.api.delete(url('/wishlist/act-three')).set(s.auth)).status).toBe(204);
    expect((await ctx.api.delete(url('/wishlist/act-three')).set(s.auth)).status).toBe(204);
    expect((await ctx.api.get(url('/wishlist')).set(s.auth)).body).toEqual([]);
  });

  it('follows and unfollows writers idempotently', async () => {
    const s = await ctx.login();
    expect((await ctx.api.put(url('/writers/daniel-reed')).set(s.auth)).status).toBe(204);
    expect((await ctx.api.put(url('/writers/daniel-reed')).set(s.auth)).status).toBe(204);
    const list = await ctx.api.get(url('/writers')).set(s.auth);
    expect(list.body.map((a: { id: string }) => a.id)).toEqual(['daniel-reed']);
    expect((await ctx.api.put(url('/writers/nobody')).set(s.auth)).status).toBe(404);
    expect((await ctx.api.delete(url('/writers/daniel-reed')).set(s.auth)).status).toBe(204);
    expect((await ctx.api.get(url('/writers')).set(s.auth)).body).toEqual([]);
  });
});

describe('recommendations', () => {
  it('falls back to top-rated books without history', async () => {
    const s = await ctx.login();
    const res = await ctx.api.get(url('/recommendations?limit=3')).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const ratings = res.body.map((b: { rating: number }) => b.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });
});
