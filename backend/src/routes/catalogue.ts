import { Router } from 'express';
import type { Db } from '../db.js';
import { BOOK_SELECT, findBook, likePattern, toBook, type BookRow } from '../books.js';
import { currentUser, type TokenVerifier, requireAuth } from '../auth.js';
import { notFound, conflict } from '../errors.js';
import { bookSearchQuery, limitQuery, pageQuery, parse, reviewInput, slug } from '../validate.js';
import { z } from 'zod';

const SORTS: Record<string, string> = {
  relevance: 'b.rating DESC, b.copies_sold DESC, b.id',
  price_asc: 'b.price ASC, b.id',
  price_desc: 'b.price DESC, b.id',
  rating: 'b.rating DESC, b.rating_count DESC, b.id',
  newest: 'b.published_at DESC, b.id',
};

interface ReviewRow {
  id: string;
  book_id: string;
  author_name: string;
  rating: number;
  body: string;
  created_at: Date;
}

const toReview = (r: ReviewRow) => ({
  id: r.id,
  bookId: r.book_id,
  authorName: r.author_name,
  rating: r.rating,
  text: r.body,
  createdAt: new Date(r.created_at).toISOString(),
});

export const catalogueRouter = (db: Db, verify: TokenVerifier): Router => {
  const r = Router();
  const bookParam = (raw: unknown) => parse(z.object({ bookId: slug }), { bookId: raw }).bookId;

  r.get('/categories', async (_req, res) => {
    res.json(await db.query('SELECT id, label FROM categories ORDER BY sort_order, label'));
  });

  r.get('/authors', async (_req, res) => {
    res.json(await db.query('SELECT id, name, bio FROM authors ORDER BY name'));
  });

  r.get('/authors/:authorId', async (req, res) => {
    const { authorId } = parse(z.object({ authorId: slug }), req.params);
    const [author] = await db.query('SELECT id, name, bio FROM authors WHERE id = $1', [authorId]);
    if (!author) throw notFound('Writer');
    const books = await db.query<BookRow>(`${BOOK_SELECT} WHERE b.author_id = $1 ORDER BY b.published_at DESC, b.id`, [authorId]);
    res.json({ ...author, books: books.map((b) => toBook(b)) });
  });

  r.get('/books', async (req, res) => {
    const f = parse(bookSearchQuery, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (f.category) add('b.category_id = ?', f.category);
    if (f.author) add('b.author_id = ?', f.author);
    if (f.language) add('b.language = ?', f.language);
    if (f.format) add('b.format = ?::book_format', f.format);
    if (f.minPrice !== undefined) add('b.price >= ?', f.minPrice);
    if (f.maxPrice !== undefined) add('b.price <= ?', f.maxPrice);
    for (const term of (f.q ?? '').split(/\s+/).filter(Boolean)) {
      add(
        `(b.title || ' ' || b.subtitle || ' ' || a.name || ' ' || p.name || ' ' || array_to_string(b.tags, ' ')) ILIKE ? ESCAPE '\\'`,
        likePattern(term),
      );
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [{ total } = { total: 0 }] = await db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM books b JOIN authors a ON a.id = b.author_id JOIN publishers p ON p.id = b.publisher_id${whereSql}`,
      params,
    );
    const rows = await db.query<BookRow>(
      `${BOOK_SELECT}${whereSql} ORDER BY ${SORTS[f.sort]} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.pageSize, (f.page - 1) * f.pageSize],
    );
    res.json({ page: f.page, pageSize: f.pageSize, total, items: rows.map((b) => toBook(b)) });
  });

  r.get('/books/bestsellers', async (req, res) => {
    const { limit } = parse(limitQuery, req.query);
    const rows = await db.query<BookRow>(`${BOOK_SELECT} ORDER BY b.copies_sold DESC, b.id LIMIT $1`, [limit]);
    res.json(rows.map((b) => toBook(b)));
  });

  r.get('/books/new-launches', async (req, res) => {
    const { limit } = parse(limitQuery, req.query);
    const rows = await db.query<BookRow>(`${BOOK_SELECT} ORDER BY b.published_at DESC, b.id LIMIT $1`, [limit]);
    res.json(rows.map((b) => toBook(b)));
  });

  r.get('/books/:bookId', async (req, res) => {
    const book = await findBook(db, bookParam(req.params.bookId));
    if (!book) throw notFound('Book');
    res.json(book);
  });

  r.get('/books/:bookId/related', async (req, res) => {
    const bookId = bookParam(req.params.bookId);
    const { limit } = parse(limitQuery, req.query);
    const book = await findBook(db, bookId);
    if (!book) throw notFound('Book');
    const rows = await db.query<BookRow>(
      `${BOOK_SELECT} WHERE b.id <> $1 AND (b.category_id = $2 OR b.author_id = $3)
        ORDER BY b.rating DESC, b.id LIMIT $4`,
      [bookId, book.categoryId, book.author.id, limit],
    );
    res.json(rows.map((b) => toBook(b)));
  });

  r.get('/books/:bookId/reviews', async (req, res) => {
    const bookId = bookParam(req.params.bookId);
    const { page, pageSize } = parse(pageQuery, req.query);
    if (!(await findBook(db, bookId))) throw notFound('Book');
    const [{ total } = { total: 0 }] = await db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM reviews WHERE book_id = $1',
      [bookId],
    );
    const rows = await db.query<ReviewRow>(
      `SELECT rv.id, rv.book_id, u.name AS author_name, rv.rating, rv.body, rv.created_at
         FROM reviews rv JOIN users u ON u.id = rv.user_id
        WHERE rv.book_id = $1 ORDER BY rv.created_at DESC, rv.id LIMIT $2 OFFSET $3`,
      [bookId, pageSize, (page - 1) * pageSize],
    );
    res.json({ page, pageSize, total, items: rows.map(toReview) });
  });

  r.post('/books/:bookId/reviews', requireAuth(db, verify), async (req, res) => {
    const user = currentUser(req);
    const bookId = bookParam(req.params.bookId);
    const input = parse(reviewInput, req.body);
    if (!(await findBook(db, bookId))) throw notFound('Book');
    const review = await db.transaction(async (tx) => {
      const [row] = await tx.query<ReviewRow>(
        `INSERT INTO reviews (book_id, user_id, rating, body) VALUES ($1, $2, $3, $4)
         ON CONFLICT (book_id, user_id) DO NOTHING
         RETURNING id, book_id, $5::text AS author_name, rating, body, created_at`,
        [bookId, user.id, input.rating, input.text, user.name],
      );
      if (!row) throw conflict('You have already reviewed this book.');
      // Fold the new rating into the running average kept on the book.
      await tx.query(
        `UPDATE books SET
           rating = round(((rating * rating_count + $2) / (rating_count + 1))::numeric, 1),
           rating_count = rating_count + 1
         WHERE id = $1`,
        [bookId, input.rating],
      );
      return row;
    });
    res.status(201).json(toReview(review));
  });

  return r;
};
