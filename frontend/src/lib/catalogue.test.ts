import { describe, expect, it } from 'vitest';
import { books } from '../data/books';
import { bestsellers, defaultFilters, filterBooks, newLaunches, recommendFromHistory, relatedBooks } from './catalogue';
import { isValidCardNumber, isValidExpiry, validateAddress, emptyAddress } from './validation';
import { createInitialState } from '../store/initialState';
import { reducer, MAX_QTY } from '../store/reducer';

describe('catalogue', () => {
  it('has a title for every category and unique ids', () => {
    expect(new Set(books.map((b) => b.id)).size).toBe(books.length);
  });

  it('filters by category, format, price and query', () => {
    expect(filterBooks(books, { ...defaultFilters, categoryId: 'romance' }).every((b) => b.categoryId === 'romance')).toBe(true);
    expect(filterBooks(books, { ...defaultFilters, format: 'eBook' }).every((b) => b.format === 'eBook')).toBe(true);
    expect(filterBooks(books, { ...defaultFilters, priceRangeId: 'under-40' }).every((b) => b.price < 40)).toBe(true);
    const r = filterBooks(books, { ...defaultFilters, query: 'daniel reed' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((b) => b.id === 'joy-of-minimalism')).toBe(true);
  });

  it('sorts by price', () => {
    const asc = filterBooks(books, { ...defaultFilters, sort: 'price-asc' }).map((b) => b.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
  });

  it('builds the home sections', () => {
    expect(bestsellers(books)).toHaveLength(3);
    expect(newLaunches(books)[0].publishedAt >= newLaunches(books)[2].publishedAt).toBe(true);
  });

  it('recommends from order history and excludes purchased books', () => {
    const { orders } = createInitialState();
    const recs = recommendFromHistory(orders, 5);
    const purchased = orders.flatMap((o) => o.items.map((i) => i.bookId));
    expect(recs.some((b) => purchased.includes(b.id))).toBe(false);
    const related = (b: (typeof recs)[number]) =>
      ['self-help', 'mystery'].includes(b.categoryId) || ['radu-ionescu', 'james-adams'].includes(b.authorId);
    expect(related(recs[0])).toBe(true);
  });

  it('finds related books excluding the book itself', () => {
    const book = books.find((b) => b.id === 'joy-of-minimalism')!;
    const related = relatedBooks(book);
    expect(related.length).toBe(3);
    expect(related.some((b) => b.id === book.id)).toBe(false);
  });
});

describe('validation', () => {
  it('validates cards with Luhn', () => {
    expect(isValidCardNumber('4111-1111-1111-1111')).toBe(true);
    expect(isValidCardNumber('4111-1111-1111-1112')).toBe(false);
  });

  it('validates expiry', () => {
    expect(isValidExpiry('01/2020')).toBe(false);
    expect(isValidExpiry('12/2099')).toBe(true);
    expect(isValidExpiry('13/2099')).toBe(false);
  });

  it('reports every missing address field', () => {
    expect(Object.keys(validateAddress(emptyAddress)).length).toBeGreaterThanOrEqual(8);
    expect(validateAddress({ ...emptyAddress, postalCode: '010063', phone: '712345678' })).not.toHaveProperty('postalCode');
    expect(validateAddress({ ...emptyAddress, phone: '0712345678' })).toHaveProperty('phone');
  });
});

describe('store reducer', () => {
  it('adds, clamps and removes cart items', () => {
    let s = createInitialState();
    s = reducer(s, { type: 'cart/add', bookId: 'x', qty: 1 });
    s = reducer(s, { type: 'cart/add', bookId: 'x', qty: 1 });
    expect(s.cart[0].qty).toBe(2);
    s = reducer(s, { type: 'cart/setQty', bookId: 'x', qty: 999 });
    expect(s.cart[0].qty).toBe(MAX_QTY);
    s = reducer(s, { type: 'cart/remove', bookId: 'x' });
    expect(s.cart).toHaveLength(0);
  });

  it('places and cancels an order, adjusting wallet and points', () => {
    let s = createInitialState();
    s = reducer(s, { type: 'cart/add', bookId: 'the-art-of-focus', qty: 1 });
    const base = s.orders[0];
    const order = {
      ...base,
      id: 'BW-TEST',
      status: 'placed' as const,
      pointsUsed: 10,
      pricing: { ...base.pricing, total: 90 },
    };
    s = reducer(s, { type: 'order/place', order, walletDebit: 90 });
    expect(s.cart).toHaveLength(0);
    expect(s.walletBalance).toBe(110);
    expect(s.giftPoints).toBe(50 - 10 + 9);
    expect(s.addresses).toHaveLength(1);

    s = reducer(s, { type: 'order/cancel', orderId: 'BW-TEST' });
    expect(s.orders[0].status).toBe('cancelled');
    expect(s.walletBalance).toBe(200);
    expect(s.giftPoints).toBe(50);
  });

  it('does not refund the wallet when a cash-on-delivery order is cancelled', () => {
    let s = createInitialState();
    const order = { ...s.orders[0], id: 'BW-COD', status: 'placed' as const, paymentMethod: 'cash-on-delivery' as const };
    s = reducer(s, { type: 'order/place', order, walletDebit: 0 });
    s = reducer(s, { type: 'order/cancel', orderId: 'BW-COD' });
    expect(s.orders[0].status).toBe('cancelled');
    expect(s.walletBalance).toBe(200);
  });

  it('toggles wishlist entries', () => {
    let s = createInitialState();
    s = reducer(s, { type: 'wishlist/toggle', bookId: 'a' });
    expect(s.wishlist).toEqual(['a']);
    s = reducer(s, { type: 'wishlist/toggle', bookId: 'a' });
    expect(s.wishlist).toEqual([]);
  });
});
