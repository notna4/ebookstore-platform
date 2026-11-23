import { authors } from '../data/authors';
import { ALL_CATEGORY_ID } from '../data/categories';
import { books } from '../data/books';
import type { Book, BookFormat, Order } from '../types';
import { formatPrice } from './format';

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

export const sortOptions: { id: SortKey; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'rating', label: 'Rating' },
  { id: 'newest', label: 'Newest' },
];

export const formatOptions: { id: BookFormat | 'All'; label: string }[] = [
  { id: 'All', label: 'All' },
  { id: 'Paperback', label: 'Paperback' },
  { id: 'Hardcover', label: 'Hardcover' },
  { id: 'eBook', label: 'eBook' },
];

export const priceRanges: { id: string; label: string; min: number; max: number }[] = [
  { id: 'all', label: 'All', min: 0, max: Infinity },
  { id: 'under-40', label: `Under ${formatPrice(40)}`, min: 0, max: 39.99 },
  { id: '40-80', label: `${formatPrice(40)} – ${formatPrice(80)}`, min: 40, max: 80 },
  { id: 'over-80', label: `Over ${formatPrice(80)}`, min: 80.01, max: Infinity },
];

export interface CatalogueFilters {
  categoryId: string;
  query: string;
  language: string;
  format: BookFormat | 'All';
  priceRangeId: string;
  sort: SortKey;
}

export const defaultFilters: CatalogueFilters = {
  categoryId: ALL_CATEGORY_ID,
  query: '',
  language: 'All',
  format: 'All',
  priceRangeId: 'all',
  sort: 'relevance',
};

const authorName = (id: string): string => authors.find((a) => a.id === id)?.name ?? '';

const matchesQuery = (book: Book, q: string): boolean => {
  if (!q) return true;
  const hay = [book.title, book.subtitle, authorName(book.authorId), book.publisher, ...book.tags]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
};

export const filterBooks = (source: Book[], f: CatalogueFilters): Book[] => {
  const range = priceRanges.find((r) => r.id === f.priceRangeId) ?? priceRanges[0];
  const result = source.filter(
    (b) =>
      (f.categoryId === ALL_CATEGORY_ID || b.categoryId === f.categoryId) &&
      matchesQuery(b, f.query.trim()) &&
      (f.language === 'All' || b.language === f.language) &&
      (f.format === 'All' || b.format === f.format) &&
      b.price >= range.min &&
      b.price <= range.max,
  );
  const sorted = [...result];
  switch (f.sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating);
    case 'newest':
      return sorted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    default:
      return sorted;
  }
};

export const bestsellers = (source: Book[], n = 3): Book[] =>
  [...source].sort((a, b) => b.sells - a.sells).slice(0, n);

export const newLaunches = (source: Book[], n = 3): Book[] =>
  [...source].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, n);

/** Books related to a given book: same category or author, ranked by rating. */
export const relatedBooks = (book: Book, n = 3): Book[] =>
  books
    .filter((b) => b.id !== book.id && (b.categoryId === book.categoryId || b.authorId === book.authorId))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, n);

/**
 * Recommendations driven by order history: books in categories/by authors the
 * user has bought before (excluding already-purchased titles). Falls back to
 * top-rated books when there is no history.
 */
export const recommendFromHistory = (orders: Order[], n = 3): Book[] => {
  const purchased = new Set<string>();
  const categoryWeight = new Map<string, number>();
  const authorWeight = new Map<string, number>();
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    for (const item of order.items) {
      purchased.add(item.bookId);
      const b = books.find((x) => x.id === item.bookId);
      if (!b) continue;
      categoryWeight.set(b.categoryId, (categoryWeight.get(b.categoryId) ?? 0) + 1);
      authorWeight.set(b.authorId, (authorWeight.get(b.authorId) ?? 0) + 1);
    }
  }
  const score = (b: Book): number =>
    (categoryWeight.get(b.categoryId) ?? 0) * 2 + (authorWeight.get(b.authorId) ?? 0) * 3 + b.rating;
  return books
    .filter((b) => !purchased.has(b.id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
};
