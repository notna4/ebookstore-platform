import type { Queryable } from './db.js';

export type BookFormat = 'Paperback' | 'Hardcover' | 'eBook';

export interface BookRow {
  id: string;
  title: string;
  subtitle: string;
  author_id: string;
  author_name: string;
  publisher: string;
  category_id: string;
  tags: string[];
  format: BookFormat;
  price: number;
  language: string;
  isbn: string;
  published_at: string;
  stock: number | null;
  rating: number;
  rating_count: number;
  copies_sold: number;
}

/** Shared SELECT for books; numerics are cast so drivers return JS numbers. `extra` adds columns (e.g. from a join). */
export const bookSelect = (extra = ''): string => `
  SELECT ${extra ? `${extra}, ` : ''}b.id, b.title, b.subtitle, b.author_id, a.name AS author_name, p.name AS publisher,
         b.category_id, b.tags, b.format, b.price::float8 AS price, b.language, b.isbn,
         to_char(b.published_at, 'YYYY-MM-DD') AS published_at, b.stock,
         b.rating::float8 AS rating, b.rating_count, b.copies_sold
    FROM books b
    JOIN authors a ON a.id = b.author_id
    JOIN publishers p ON p.id = b.publisher_id`;

export const BOOK_SELECT = bookSelect();

/** Days from order to delivery for physical formats; eBooks are delivered instantly. */
const DELIVERY_DAYS: Record<Exclude<BookFormat, 'eBook'>, number> = { Paperback: 4, Hardcover: 6 };

export const estimateDelivery = (format: BookFormat, now = new Date()): { instant: boolean; date?: string } => {
  if (format === 'eBook') return { instant: true };
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + DELIVERY_DAYS[format]);
  return { instant: false, date: date.toISOString().slice(0, 10) };
};

export const toBook = (row: BookRow, now = new Date()) => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle,
  author: { id: row.author_id, name: row.author_name },
  publisher: row.publisher,
  categoryId: row.category_id,
  tags: row.tags,
  format: row.format,
  price: Number(row.price),
  language: row.language,
  rating: Number(row.rating),
  ratingCount: row.rating_count,
  copiesSold: row.copies_sold,
  publishedAt: row.published_at,
  isbn: row.isbn,
  inStock: row.format === 'eBook' || (row.stock ?? 0) > 0,
  estimatedDelivery: estimateDelivery(row.format, now),
});

export type BookDto = ReturnType<typeof toBook>;

export const findBook = async (q: Queryable, id: string): Promise<BookDto | undefined> => {
  const [row] = await q.query<BookRow>(`${BOOK_SELECT} WHERE b.id = $1`, [id]);
  return row ? toBook(row) : undefined;
};

/** Escapes LIKE wildcards so user text is matched literally. */
export const likePattern = (term: string): string => `%${term.replace(/[\\%_]/g, '\\$&')}%`;
