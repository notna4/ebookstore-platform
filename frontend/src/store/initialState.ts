import { bookById } from '../data/books';
import { computePricing } from '../lib/pricing';
import type { Order, Review } from '../types';
import type { StoreState } from './reducer';

const DAY = 24 * 60 * 60 * 1000;

const seedOrder = (id: string, daysAgo: number, bookId: string): Order => {
  const items = [{ bookId, qty: 1 }];
  return {
    id,
    number: id,
    items: [{ bookId, qty: 1, unitPrice: bookById(bookId)?.price ?? 0 }],
    pricing: computePricing(items),
    address: {
      firstName: 'Demo',
      lastName: 'Reader',
      address: 'Strada Victoriei 12',
      email: 'reader@example.com',
      city: 'București',
      postalCode: '010063',
      phoneCode: '+40',
      phone: '712345678',
      county: 'București',
      country: 'Romania',
    },
    paymentMethod: 'credit-card',
    status: 'delivered',
    placedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
    pointsUsed: 0,
  };
};

const seedReviews: Review[] = [
  {
    id: 'seed-1',
    bookId: 'joy-of-minimalism',
    author: 'John Smith',
    rating: 5,
    text: 'A calm, practical read. I cleared my desk and my head in a weekend.',
    createdAt: new Date(Date.now() - 12 * DAY).toISOString(),
  },
  {
    id: 'seed-2',
    bookId: 'the-art-of-focus',
    author: 'Ana Popa',
    rating: 4,
    text: 'Clear ideas and short chapters. Great for busy people.',
    createdAt: new Date(Date.now() - 20 * DAY).toISOString(),
  },
];

export const createInitialState = (): StoreState => ({
  user: null,
  cart: [],
  wishlist: [],
  followedAuthors: [],
  // Demo order history so "Buy It Again" and history-based recommendations work out of the box.
  orders: [
    seedOrder('BW-DEMO0002', 21, 'the-art-of-learning'),
    seedOrder('BW-DEMO0001', 45, 'the-midnight-hour'),
  ],
  reviews: seedReviews,
  addresses: [],
  walletBalance: 200,
  giftPoints: 50,
});
