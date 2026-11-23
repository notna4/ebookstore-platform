import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { POINT_VALUE } from '../lib/pricing';
import type { Order } from '../types';
import type { Commerce } from './commerce';
import { createInitialState } from './initialState';
import { reducer, type Action, type StoreState } from './reducer';

const STORAGE_KEY = 'bookworm:v1';

const load = (): StoreState => {
  const initial = createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return initial;
    const p = parsed as Partial<StoreState>;
    return {
      user: p.user && typeof p.user.email === 'string' && typeof p.user.name === 'string' ? p.user : null,
      cart: Array.isArray(p.cart) ? p.cart : initial.cart,
      wishlist: Array.isArray(p.wishlist) ? p.wishlist : initial.wishlist,
      followedAuthors: Array.isArray(p.followedAuthors) ? p.followedAuthors : initial.followedAuthors,
      // Orders saved before order numbers existed use their id as the number.
      orders: Array.isArray(p.orders) ? p.orders.map((o) => ({ ...o, number: o.number ?? o.id })) : initial.orders,
      reviews: Array.isArray(p.reviews) ? p.reviews : initial.reviews,
      addresses: Array.isArray(p.addresses) ? p.addresses : initial.addresses,
      walletBalance: typeof p.walletBalance === 'number' ? p.walletBalance : initial.walletBalance,
      giftPoints: typeof p.giftPoints === 'number' ? p.giftPoints : initial.giftPoints,
    };
  } catch {
    return initial;
  }
};

export interface StoreContextValue {
  state: StoreState;
  dispatch: (action: Action) => void;
  commerce: Commerce;
  /** Starts sign-in with the identity provider. Undefined in demo mode, where the login modal is used. */
  signIn?: () => void;
  /** Finishes the sign-in redirect and resolves with the path to return to. Undefined in demo mode. */
  completeSignIn?: () => Promise<string>;
  /** Loads the reviews of a book from the API (a no-op in demo mode). */
  loadReviews: (bookId: string) => Promise<void>;
  /** Message for the last failed attempt to talk to the API, if any. */
  syncError: string | null;
}

export const StoreContext = createContext<StoreContextValue | null>(null);

const DEMO_PROCESSING_MS = 1200;

const newOrderNumber = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `BW-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

export function StoreProvider({ children, initialState }: { children: ReactNode; initialState?: StoreState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState ?? load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable or full: continue without persistence */
    }
  }, [state]);

  // Demo mode: orders are placed against the local store after a short simulated gateway delay.
  const commerce = useMemo<Commerce>(
    () => ({
      async placeOrder(input) {
        await new Promise((resolve) => window.setTimeout(resolve, DEMO_PROCESSING_MS));
        const number = newOrderNumber();
        const order: Order = {
          id: number,
          number,
          items: input.items,
          pricing: input.pricing,
          address: input.address,
          paymentMethod: input.method,
          status: 'placed',
          placedAt: new Date().toISOString(),
          couponCode: input.couponCode,
          pointsUsed: input.pricing.pointsDiscount / POINT_VALUE,
        };
        dispatch({ type: 'order/place', order, walletDebit: input.method === 'wallet' ? input.pricing.total : 0 });
        return { order };
      },
      async cancelOrder(orderId) {
        dispatch({ type: 'order/cancel', orderId });
        return undefined;
      },
      async discardPending() {},
    }),
    [],
  );

  const value = useMemo(
    () => ({ state, dispatch, commerce, loadReviews: async () => {}, syncError: null }),
    [state, commerce],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
