import type { User as OidcUser, UserManager } from 'oidc-client-ts';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createUserManager } from '../api/auth';
import { createApiClient, errorMessage, type ApiClient } from '../api/client';
import { createApiCommerce } from '../api/commerce';
import type { ApiConfig } from '../api/config';
import { toAddress, toCartItems, toOrder, toReview, type ApiAddress, type ApiCart, type ApiOrder, type ApiReview } from '../api/mappers';
import type { Order } from '../types';
import { StoreContext, type StoreContextValue } from './StoreContext';
import { clampQty, emptyState, reducer, type Action, type StoreState } from './reducer';

interface ApiMe {
  name: string;
  email: string;
  walletBalance: number;
  giftPoints: number;
}

const ORDER_HISTORY_PAGE_SIZE = 50;

const loadServerState = async (client: ApiClient): Promise<Partial<StoreState>> => {
  const [me, cart, wishlist, writers, orders, addresses] = await Promise.all([
    client.request<ApiMe>('GET', '/me'),
    client.request<ApiCart>('GET', '/me/cart'),
    client.request<{ id: string }[]>('GET', '/me/wishlist'),
    client.request<{ id: string }[]>('GET', '/me/writers'),
    client.request<{ items: ApiOrder[] }>('GET', `/orders?pageSize=${ORDER_HISTORY_PAGE_SIZE}`),
    client.request<(ApiAddress & { isDefault?: boolean })[]>('GET', '/me/addresses'),
  ]);
  return {
    user: { name: me.name, email: me.email },
    walletBalance: me.walletBalance,
    giftPoints: me.giftPoints,
    cart: toCartItems(cart),
    wishlist: wishlist.map((b) => b.id),
    followedAuthors: writers.map((a) => a.id),
    orders: orders.items.map(toOrder).filter((o): o is Order => o !== null),
    addresses: addresses.map(toAddress),
  };
};

/** Pushes what an anonymous visitor collected locally (cart, wishlist, writers) into their new account. */
const mergeAnonymousState = async (client: ApiClient, local: StoreState) => {
  if (local.cart.length > 0) {
    const server = await client.request<ApiCart>('GET', '/me/cart');
    const existing = new Map(toCartItems(server).map((i) => [i.bookId, i.qty]));
    for (const item of local.cart) {
      await client.request('PUT', `/me/cart/items/${item.bookId}`, {
        body: { quantity: clampQty((existing.get(item.bookId) ?? 0) + item.qty) },
      });
    }
  }
  for (const id of local.wishlist) await client.request('PUT', `/me/wishlist/${id}`);
  for (const id of local.followedAuthors) await client.request('PUT', `/me/writers/${id}`);
};

const profileReturnTo = (user: OidcUser): string => {
  const state = user.state as { returnTo?: string } | undefined;
  return state?.returnTo && state.returnTo.startsWith('/') && !state.returnTo.startsWith('//') ? state.returnTo : '/';
};

/** Store backed by the REST API; the user signs in with OpenID Connect. */
export function ApiStoreProvider({ config, children }: { config: ApiConfig; children: ReactNode }) {
  const manager = useMemo<UserManager>(() => createUserManager(config), [config]);
  const client = useMemo(
    () => createApiClient(config.baseUrl, async () => (await manager.getUser())?.access_token),
    [config.baseUrl, manager],
  );
  const apiCommerce = useMemo(() => createApiCommerce(client), [client]);

  const [state, baseDispatch] = useReducer(reducer, emptyState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [syncError, setSyncError] = useState<string | null>(null);

  // API calls for one visitor run in order, so rapid clicks cannot overtake each other.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async () => {
    try {
      baseDispatch({ type: 'server/sync', patch: await loadServerState(client) });
      setSyncError(null);
    } catch (err) {
      setSyncError(errorMessage(err));
    }
  }, [client]);

  const onUser = useCallback(
    async (user: OidcUser | null) => {
      if (!user || user.expired) {
        baseDispatch({ type: 'server/reset' });
        return;
      }
      try {
        await mergeAnonymousState(client, stateRef.current);
      } catch (err) {
        setSyncError(errorMessage(err));
      }
      await refresh();
    },
    [client, refresh],
  );

  useEffect(() => {
    void manager.getUser().then(onUser);
    const loaded = (u: OidcUser) => void onUser(u);
    const unloaded = () => void onUser(null);
    manager.events.addUserLoaded(loaded);
    manager.events.addUserUnloaded(unloaded);
    manager.events.addAccessTokenExpired(unloaded);
    return () => {
      manager.events.removeUserLoaded(loaded);
      manager.events.removeUserUnloaded(unloaded);
      manager.events.removeAccessTokenExpired(unloaded);
    };
  }, [manager, onUser]);

  const enqueue = useCallback(
    (job: () => Promise<unknown>) => {
      queue.current = queue.current.then(job).catch(async (err: unknown) => {
        setSyncError(errorMessage(err));
        await refresh(); // roll the optimistic change back to what the server has
      });
    },
    [refresh],
  );

  const loadReviews = useCallback(
    async (bookId: string) => {
      try {
        const page = await client.request<{ items: ApiReview[] }>('GET', `/books/${bookId}/reviews?pageSize=50`);
        baseDispatch({ type: 'server/reviews', bookId, reviews: page.items.map(toReview) });
      } catch {
        /* reviews are optional content: leave the page without them */
      }
    },
    [client],
  );

  const dispatch = useCallback(
    (action: Action) => {
      const s = stateRef.current;
      if (action.type === 'logout') {
        void manager.signoutRedirect().catch(() => manager.removeUser());
        return;
      }
      baseDispatch(action); // optimistic update
      if (!s.user) return; // anonymous changes are merged into the account at sign-in

      switch (action.type) {
        case 'cart/add': {
          const qty = clampQty((s.cart.find((i) => i.bookId === action.bookId)?.qty ?? 0) + action.qty);
          enqueue(() => client.request('PUT', `/me/cart/items/${action.bookId}`, { body: { quantity: qty } }));
          break;
        }
        case 'cart/setQty':
          enqueue(() => client.request('PUT', `/me/cart/items/${action.bookId}`, { body: { quantity: clampQty(action.qty) } }));
          break;
        case 'cart/remove':
          enqueue(() => client.request('DELETE', `/me/cart/items/${action.bookId}`));
          break;
        case 'wishlist/toggle':
          enqueue(() => client.request(s.wishlist.includes(action.bookId) ? 'DELETE' : 'PUT', `/me/wishlist/${action.bookId}`));
          break;
        case 'author/toggleFollow':
          enqueue(() => client.request(s.followedAuthors.includes(action.authorId) ? 'DELETE' : 'PUT', `/me/writers/${action.authorId}`));
          break;
        case 'review/add': {
          const { bookId, rating, text } = action.review;
          enqueue(async () => {
            await client.request('POST', `/books/${bookId}/reviews`, { body: { rating, text } });
            await loadReviews(bookId);
          });
          break;
        }
        default:
          break;
      }
    },
    [client, enqueue, loadReviews, manager],
  );

  const commerce = useMemo(
    () => ({
      ...apiCommerce,
      // Stock, points, wallet and history change on the server, so reload them after every attempt.
      placeOrder: async (input: Parameters<typeof apiCommerce.placeOrder>[0]) => {
        const result = await apiCommerce.placeOrder(input);
        await refresh();
        return result;
      },
      cancelOrder: async (orderId: string) => {
        const error = await apiCommerce.cancelOrder(orderId);
        await refresh();
        return error;
      },
      discardPending: async () => {
        await apiCommerce.discardPending();
        await refresh();
      },
    }),
    [apiCommerce, refresh],
  );

  const completion = useRef<Promise<string> | null>(null);
  const completeSignIn = useCallback(() => {
    // The callback URL can be used only once, and React StrictMode runs effects twice.
    completion.current ??= manager.signinRedirectCallback().then(profileReturnTo);
    return completion.current;
  }, [manager]);

  const signIn = useCallback(() => {
    void manager.signinRedirect({ state: { returnTo: `${window.location.pathname}${window.location.search}` } });
  }, [manager]);

  const value = useMemo<StoreContextValue>(
    () => ({ state, dispatch, commerce, signIn, loadReviews, syncError, completeSignIn }),
    [state, dispatch, commerce, signIn, loadReviews, syncError, completeSignIn],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
