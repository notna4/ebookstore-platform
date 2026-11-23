import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

const get = (path: string) => ctx.api.get(`/api/v1${path}`);

describe('catalogue', () => {
  it('lists categories and writers', async () => {
    const categories = await get('/categories');
    expect(categories.status).toBe(200);
    expect(categories.body.map((c: { id: string }) => c.id)).toContain('self-help');
    const authors = await get('/authors');
    expect(authors.body.map((a: { id: string }) => a.id)).toContain('andrei-popescu');
  });

  it('returns a writer with their books', async () => {
    const res = await get('/authors/daniel-reed');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Daniel Reed');
    expect(res.body.books.length).toBeGreaterThan(0);
    expect(res.body.books.every((b: { author: { id: string } }) => b.author.id === 'daniel-reed')).toBe(true);
    expect((await get('/authors/nobody')).status).toBe(404);
  });

  it('paginates the full catalogue', async () => {
    const res = await get('/books?pageSize=12&page=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 12, total: 40 });
    expect(res.body.items).toHaveLength(12);
  });

  it('filters by category, format and price range', async () => {
    const byCategory = await get('/books?category=self-help&pageSize=50');
    expect(byCategory.body.items.length).toBeGreaterThan(0);
    expect(byCategory.body.items.every((b: { categoryId: string }) => b.categoryId === 'self-help')).toBe(true);

    const ebooks = await get('/books?format=eBook&pageSize=50');
    expect(ebooks.body.items.every((b: { format: string }) => b.format === 'eBook')).toBe(true);

    const cheap = await get('/books?maxPrice=39.99&pageSize=50');
    expect(cheap.body.items.every((b: { price: number }) => b.price <= 39.99)).toBe(true);
  });

  it('searches title, subtitle, writer and tags, all terms required', async () => {
    const title = await get('/books?q=minimalism');
    expect(title.body.items.map((b: { id: string }) => b.id)).toContain('joy-of-minimalism');

    const writer = await get('/books?q=Daniel%20Reed&pageSize=50');
    expect(writer.body.total).toBeGreaterThan(0);
    expect(writer.body.items.every((b: { author: { id: string } }) => b.author.id === 'daniel-reed')).toBe(true);

    const none = await get('/books?q=minimalism%20zzzzqq');
    expect(none.body.total).toBe(0);
  });

  it('treats LIKE wildcards and SQL in the search text literally', async () => {
    expect((await get('/books?q=%25')).body.total).toBe(0);
    expect((await get('/books?q=_')).body.total).toBe(0);
    const injection = await get(`/books?q=${encodeURIComponent("'; DROP TABLE books; --")}`);
    expect(injection.status).toBe(200);
    expect((await get('/books')).body.total).toBe(40);
  });

  it('sorts by price and newest', async () => {
    const asc = (await get('/books?sort=price_asc&pageSize=50')).body.items.map((b: { price: number }) => b.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = (await get('/books?sort=price_desc&pageSize=50')).body.items.map((b: { price: number }) => b.price);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    const newest = (await get('/books?sort=newest&pageSize=50')).body.items.map((b: { publishedAt: string }) => b.publishedAt);
    expect(newest).toEqual([...newest].sort().reverse());
  });

  it('rejects invalid query parameters with field errors', async () => {
    const res = await get('/books?pageSize=500&sort=bogus&format=Scroll');
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['format', 'pageSize', 'sort']);
  });

  it('returns bestsellers and new launches', async () => {
    const best = (await get('/books/bestsellers?limit=5')).body;
    expect(best).toHaveLength(5);
    const sold = best.map((b: { copiesSold: number }) => b.copiesSold);
    expect(sold).toEqual([...sold].sort((a, b) => b - a));

    const fresh = (await get('/books/new-launches')).body;
    expect(fresh).toHaveLength(3);
  });

  it('gives a tentative delivery date by format', async () => {
    const paper = (await get('/books/joy-of-minimalism')).body;
    expect(paper).toMatchObject({ title: 'Joy of Minimalism', price: 30, format: 'Paperback', inStock: true });
    expect(paper.estimatedDelivery.instant).toBe(false);
    const days = (new Date(paper.estimatedDelivery.date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(3);
    expect(days).toBeLessThanOrEqual(4);

    const ebook = (await get('/books/the-vanishing-house')).body;
    expect(ebook.estimatedDelivery).toEqual({ instant: true });

    const hard = (await get('/books/the-ember-crown')).body;
    const hardDays = (new Date(hard.estimatedDelivery.date).getTime() - Date.now()) / 86_400_000;
    expect(hardDays).toBeGreaterThan(5);
  });

  it('returns 404 for unknown books and 400 for malformed ids', async () => {
    expect((await get('/books/does-not-exist')).status).toBe(404);
    expect((await get('/books/Bad_ID')).status).toBe(400);
  });

  it('suggests related reads from the same category or writer, never the book itself', async () => {
    const res = await get('/books/joy-of-minimalism/related?limit=6');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const b of res.body) {
      expect(b.id).not.toBe('joy-of-minimalism');
      expect(b.categoryId === 'self-help' || b.author.id === 'daniel-reed').toBe(true);
    }
    expect((await get('/books/nope/related')).status).toBe(404);
  });
});

describe('reviews', () => {
  it('requires sign-in to post but not to read', async () => {
    expect((await get('/books/joy-of-minimalism/reviews')).status).toBe(200);
    const res = await ctx.api.post('/api/v1/books/joy-of-minimalism/reviews').send({ rating: 5, text: 'Lovely' });
    expect(res.status).toBe(401);
  });

  it('lets a reader review a book once and updates the rating', async () => {
    const s = await ctx.login({ name: 'Elena Dumitrescu' });
    const before = (await get('/books/the-path-to-success')).body;

    const created = await ctx.api.post('/api/v1/books/the-path-to-success/reviews').set(s.auth).send({ rating: 5, text: 'Clear and practical.' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ authorName: 'Elena Dumitrescu', rating: 5, text: 'Clear and practical.', bookId: 'the-path-to-success' });

    const dup = await ctx.api.post('/api/v1/books/the-path-to-success/reviews').set(s.auth).send({ rating: 1, text: 'Changed my mind' });
    expect(dup.status).toBe(409);

    const after = (await get('/books/the-path-to-success')).body;
    expect(after.ratingCount).toBe(before.ratingCount + 1);

    const list = await get('/books/the-path-to-success/reviews');
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.items[0].authorName).toBe('Elena Dumitrescu');
  });

  it('validates rating and text length', async () => {
    const s = await ctx.login();
    const post = (body: unknown) => ctx.api.post('/api/v1/books/act-three/reviews').set(s.auth).send(body as object);
    expect((await post({ rating: 6, text: 'x' })).status).toBe(400);
    expect((await post({ rating: 3, text: 'x'.repeat(101) })).status).toBe(400);
    expect((await post({ rating: 3, text: '   ' })).status).toBe(400);
    expect((await post({ rating: 3, text: 'ok', extra: true })).status).toBe(400);
    expect((await ctx.api.post('/api/v1/books/nope/reviews').set(s.auth).send({ rating: 3, text: 'ok' })).status).toBe(404);
  });
});
