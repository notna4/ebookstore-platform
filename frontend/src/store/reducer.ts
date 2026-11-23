import type { Address, CartItem, Order, Review, User } from '../types';

export interface StoreState {
  user: User | null;
  cart: CartItem[];
  wishlist: string[];
  followedAuthors: string[];
  orders: Order[];
  reviews: Review[];
  addresses: Address[];
  walletBalance: number;
  giftPoints: number;
}

export type Action =
  | { type: 'login'; user: User }
  | { type: 'logout' }
  | { type: 'cart/add'; bookId: string; qty: number }
  | { type: 'cart/setQty'; bookId: string; qty: number }
  | { type: 'cart/remove'; bookId: string }
  | { type: 'wishlist/toggle'; bookId: string }
  | { type: 'author/toggleFollow'; authorId: string }
  | { type: 'order/place'; order: Order; walletDebit: number }
  | { type: 'order/cancel'; orderId: string }
  | { type: 'review/add'; review: Review }
  // Server-backed mode: replace local state with what the API returned.
  | { type: 'server/sync'; patch: Partial<StoreState> }
  | { type: 'server/reviews'; bookId: string; reviews: Review[] }
  | { type: 'server/reset' };

export const MAX_QTY = 10;
export const clampQty = (q: number): number => Math.min(MAX_QTY, Math.max(1, Math.floor(q) || 1));

const toggle = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const sameAddress = (a: Address, b: Address): boolean =>
  a.address === b.address && a.postalCode === b.postalCode && a.firstName === b.firstName && a.lastName === b.lastName;

/** 1 gift point is earned for every 10 RON paid. */
export const pointsEarned = (total: number): number => Math.floor(total / 10);

export const emptyState: StoreState = {
  user: null,
  cart: [],
  wishlist: [],
  followedAuthors: [],
  orders: [],
  reviews: [],
  addresses: [],
  walletBalance: 0,
  giftPoints: 0,
};

export const reducer = (state: StoreState, action: Action): StoreState => {
  switch (action.type) {
    case 'login':
      return { ...state, user: action.user };
    case 'logout':
      return { ...state, user: null };
    case 'cart/add': {
      const existing = state.cart.find((i) => i.bookId === action.bookId);
      const cart = existing
        ? state.cart.map((i) =>
            i.bookId === action.bookId ? { ...i, qty: clampQty(i.qty + action.qty) } : i,
          )
        : [...state.cart, { bookId: action.bookId, qty: clampQty(action.qty) }];
      return { ...state, cart };
    }
    case 'cart/setQty':
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.bookId === action.bookId ? { ...i, qty: clampQty(action.qty) } : i,
        ),
      };
    case 'cart/remove':
      return { ...state, cart: state.cart.filter((i) => i.bookId !== action.bookId) };
    case 'wishlist/toggle':
      return { ...state, wishlist: toggle(state.wishlist, action.bookId) };
    case 'author/toggleFollow':
      return { ...state, followedAuthors: toggle(state.followedAuthors, action.authorId) };
    case 'order/place': {
      const { order, walletDebit } = action;
      return {
        ...state,
        cart: [],
        orders: [order, ...state.orders],
        walletBalance: state.walletBalance - walletDebit,
        giftPoints: state.giftPoints - order.pointsUsed + pointsEarned(order.pricing.total),
        addresses: state.addresses.some((a) => sameAddress(a, order.address))
          ? state.addresses
          : [...state.addresses, order.address],
      };
    }
    case 'order/cancel': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== 'placed') return state;
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === order.id ? { ...o, status: 'cancelled' as const } : o,
        ),
        // Cash-on-delivery orders were never paid online, so there is nothing to refund.
        walletBalance:
          order.paymentMethod === 'cash-on-delivery'
            ? state.walletBalance
            : state.walletBalance + order.pricing.total,
        giftPoints: Math.max(0, state.giftPoints + order.pointsUsed - pointsEarned(order.pricing.total)),
      };
    }
    case 'review/add':
      return { ...state, reviews: [action.review, ...state.reviews] };
    case 'server/sync':
      return { ...state, ...action.patch };
    case 'server/reviews':
      return { ...state, reviews: [...action.reviews, ...state.reviews.filter((r) => r.bookId !== action.bookId)] };
    case 'server/reset':
      return { ...emptyState, reviews: state.reviews };
    default:
      return state;
  }
};
