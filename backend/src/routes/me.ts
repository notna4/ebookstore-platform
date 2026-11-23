import { Router } from 'express';
import { z } from 'zod';
import type { Db, Queryable } from '../db.js';
import { bookSelect, BOOK_SELECT, findBook, toBook, type BookRow } from '../books.js';
import { currentUser, requireAuth, type TokenVerifier } from '../auth.js';
import { getCart } from '../cart.js';
import { notFound } from '../errors.js';
import { addressInput, cartItemInput, limitQuery, pageQuery, parse, slug, uuid, type AddressInput } from '../validate.js';

interface AddressRow {
  id: string;
  first_name: string;
  last_name: string;
  line1: string;
  email: string;
  city: string;
  postal_code: string;
  phone_code: string;
  phone: string;
  county: string;
  country: string;
  is_default: boolean;
}

export const ADDRESS_COLUMNS =
  'id, first_name, last_name, line1, email, city, postal_code, phone_code, phone, county, country, is_default';

export const toAddress = (r: AddressRow) => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  line1: r.line1,
  email: r.email,
  city: r.city,
  postalCode: r.postal_code,
  phoneCode: r.phone_code,
  phone: r.phone,
  county: r.county,
  country: r.country,
  isDefault: r.is_default,
});

/** Inserts an address for the user; making it the default demotes any previous default. */
export const insertAddress = async (tx: Queryable, userId: string, a: AddressInput) => {
  if (a.isDefault) await tx.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default', [userId]);
  const [row] = await tx.query<AddressRow>(
    `INSERT INTO addresses (user_id, first_name, last_name, line1, email, city, postal_code, phone_code, phone, county, country, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${ADDRESS_COLUMNS}`,
    [userId, a.firstName, a.lastName, a.line1, a.email, a.city, a.postalCode, a.phoneCode, a.phone, a.county, a.country, a.isDefault],
  );
  return toAddress(row!);
};

const idParam = (name: string, schema: z.ZodType<string>, params: unknown) =>
  parse(z.object({ [name]: schema }), params)[name] as string;

export const meRouter = (db: Db, verify: TokenVerifier): Router => {
  const r = Router();
  r.use(requireAuth(db, verify));

  r.get('/', async (req, res) => {
    const { id } = currentUser(req);
    const [u] = await db.query<{ id: string; name: string; email: string; wallet_balance: number; gift_points: number }>(
      'SELECT id, name, email, wallet_balance::float8 AS wallet_balance, gift_points FROM users WHERE id = $1',
      [id],
    );
    res.json({ id: u!.id, name: u!.name, email: u!.email, walletBalance: Number(u!.wallet_balance), giftPoints: u!.gift_points });
  });

  r.get('/recommendations', async (req, res) => {
    const { id } = currentUser(req);
    const { limit } = parse(limitQuery, req.query);
    // Books in categories / by writers the user has bought before rank higher; falls back to top-rated.
    const rows = await db.query<BookRow>(
      `WITH hist AS (
         SELECT b.id, b.category_id, b.author_id
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN books b ON b.id = oi.book_id
          WHERE o.user_id = $1 AND o.status IN ('placed', 'delivered')
       )
       ${bookSelect(`(SELECT count(*) FROM hist h WHERE h.category_id = b.category_id) * 2
            + (SELECT count(*) FROM hist h WHERE h.author_id = b.author_id) * 3 + b.rating::float8 AS score`)}
        WHERE b.id NOT IN (SELECT id FROM hist)
        ORDER BY score DESC, b.id LIMIT $2`,
      [id, limit],
    );
    res.json(rows.map((b) => toBook(b)));
  });

  // --- addresses -----------------------------------------------------------
  r.get('/addresses', async (req, res) => {
    const rows = await db.query<AddressRow>(
      `SELECT ${ADDRESS_COLUMNS} FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at, id`,
      [currentUser(req).id],
    );
    res.json(rows.map(toAddress));
  });

  r.post('/addresses', async (req, res) => {
    const { id } = currentUser(req);
    const input = parse(addressInput, req.body);
    res.status(201).json(await db.transaction((tx) => insertAddress(tx, id, input)));
  });

  r.put('/addresses/:addressId', async (req, res) => {
    const { id } = currentUser(req);
    const addressId = idParam('addressId', uuid, req.params);
    const a = parse(addressInput, req.body);
    const updated = await db.transaction(async (tx) => {
      if (a.isDefault) {
        await tx.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default AND id <> $2', [id, addressId]);
      }
      const [row] = await tx.query<AddressRow>(
        `UPDATE addresses SET first_name = $3, last_name = $4, line1 = $5, email = $6, city = $7, postal_code = $8,
                phone_code = $9, phone = $10, county = $11, country = $12, is_default = $13
          WHERE id = $1 AND user_id = $2 RETURNING ${ADDRESS_COLUMNS}`,
        [addressId, id, a.firstName, a.lastName, a.line1, a.email, a.city, a.postalCode, a.phoneCode, a.phone, a.county, a.country, a.isDefault],
      );
      return row;
    });
    if (!updated) throw notFound('Address');
    res.json(toAddress(updated));
  });

  r.delete('/addresses/:addressId', async (req, res) => {
    const addressId = idParam('addressId', uuid, req.params);
    const rows = await db.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id', [addressId, currentUser(req).id]);
    if (rows.length === 0) throw notFound('Address');
    res.status(204).end();
  });

  // --- wallet --------------------------------------------------------------
  r.get('/wallet/transactions', async (req, res) => {
    const { id } = currentUser(req);
    const { page, pageSize } = parse(pageQuery, req.query);
    const [user] = await db.query<{ balance: number }>('SELECT wallet_balance::float8 AS balance FROM users WHERE id = $1', [id]);
    const rows = await db.query<{ id: string; order_id: string | null; reason: string; amount: number; created_at: Date }>(
      `SELECT id, order_id, reason, amount::float8 AS amount, created_at FROM wallet_transactions
        WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
      [id, pageSize, (page - 1) * pageSize],
    );
    res.json({
      balance: Number(user!.balance),
      items: rows.map((t) => ({
        id: t.id,
        ...(t.order_id ? { orderId: t.order_id } : {}),
        reason: t.reason,
        amount: Number(t.amount),
        createdAt: new Date(t.created_at).toISOString(),
      })),
    });
  });

  // --- cart ----------------------------------------------------------------
  r.get('/cart', async (req, res) => {
    res.json(await getCart(db, currentUser(req).id));
  });

  r.delete('/cart', async (req, res) => {
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [currentUser(req).id]);
    res.status(204).end();
  });

  r.put('/cart/items/:bookId', async (req, res) => {
    const { id } = currentUser(req);
    const bookId = idParam('bookId', slug, req.params);
    const { quantity } = parse(cartItemInput, req.body);
    if (!(await findBook(db, bookId))) throw notFound('Book');
    await db.query(
      `INSERT INTO cart_items (user_id, book_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
      [id, bookId, quantity],
    );
    res.json(await getCart(db, id));
  });

  r.delete('/cart/items/:bookId', async (req, res) => {
    const { id } = currentUser(req);
    await db.query('DELETE FROM cart_items WHERE user_id = $1 AND book_id = $2', [id, idParam('bookId', slug, req.params)]);
    res.json(await getCart(db, id));
  });

  // --- wishlist ------------------------------------------------------------
  r.get('/wishlist', async (req, res) => {
    const rows = await db.query<BookRow>(
      `${BOOK_SELECT} JOIN wishlist_items w ON w.book_id = b.id WHERE w.user_id = $1 ORDER BY w.added_at DESC, b.id`,
      [currentUser(req).id],
    );
    res.json(rows.map((b) => toBook(b)));
  });

  r.put('/wishlist/:bookId', async (req, res) => {
    const bookId = idParam('bookId', slug, req.params);
    if (!(await findBook(db, bookId))) throw notFound('Book');
    await db.query('INSERT INTO wishlist_items (user_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [currentUser(req).id, bookId]);
    res.status(204).end();
  });

  r.delete('/wishlist/:bookId', async (req, res) => {
    await db.query('DELETE FROM wishlist_items WHERE user_id = $1 AND book_id = $2', [currentUser(req).id, idParam('bookId', slug, req.params)]);
    res.status(204).end();
  });

  // --- followed writers ----------------------------------------------------
  r.get('/writers', async (req, res) => {
    res.json(
      await db.query(
        `SELECT a.id, a.name, a.bio FROM authors a JOIN followed_authors f ON f.author_id = a.id
          WHERE f.user_id = $1 ORDER BY a.name`,
        [currentUser(req).id],
      ),
    );
  });

  r.put('/writers/:authorId', async (req, res) => {
    const authorId = idParam('authorId', slug, req.params);
    const [author] = await db.query('SELECT id FROM authors WHERE id = $1', [authorId]);
    if (!author) throw notFound('Writer');
    await db.query('INSERT INTO followed_authors (user_id, author_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [currentUser(req).id, authorId]);
    res.status(204).end();
  });

  r.delete('/writers/:authorId', async (req, res) => {
    await db.query('DELETE FROM followed_authors WHERE user_id = $1 AND author_id = $2', [currentUser(req).id, idParam('authorId', slug, req.params)]);
    res.status(204).end();
  });

  return r;
};
