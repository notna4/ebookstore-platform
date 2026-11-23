import { bookSelect, toBook, type BookRow } from './books.js';
import type { Queryable } from './db.js';
import { round2 } from './pricing.js';

export const getCart = async (q: Queryable, userId: string) => {
  const rows = await q.query<BookRow & { quantity: number }>(
    `${bookSelect('ci.quantity')}
      JOIN cart_items ci ON ci.book_id = b.id
     WHERE ci.user_id = $1
     ORDER BY ci.added_at, b.id`,
    [userId],
  );
  const items = rows.map((r) => {
    const book = toBook(r);
    return { book, quantity: r.quantity, lineTotal: round2(book.price * r.quantity) };
  });
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: round2(items.reduce((sum, i) => sum + i.lineTotal, 0)),
  };
};

export type CartDto = Awaited<ReturnType<typeof getCart>>;
