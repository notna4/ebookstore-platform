import { describe, expect, it, vi } from 'vitest';
import { createApiClient, ApiError, errorMessage, type ApiClient } from './client';
import { createApiCommerce } from './commerce';
import { readApiConfig } from './config';
import { toApiAddress, toOrder, tokenizeCard, type ApiOrder } from './mappers';
import type { PlaceOrderInput } from '../store/commerce';
import type { Address } from '../types';

const address: Address = {
  firstName: ' Maria ',
  lastName: 'Popescu',
  address: 'Strada Lunga 12',
  email: 'maria.popescu@example.com',
  city: 'Brașov',
  postalCode: '500001',
  phoneCode: '+40',
  phone: '712345678',
  county: 'Brașov',
  country: 'Romania',
};

const apiOrder = (over: Partial<ApiOrder> = {}): ApiOrder => ({
  id: 'o-1',
  orderNumber: 'BW-000001',
  status: 'placed',
  paymentMethod: 'wallet',
  items: [{ bookId: 'b1', title: 'T', quantity: 2, unitPrice: 30 }],
  shippingAddress: toApiAddress(address),
  subtotal: 60,
  tax: 6,
  deliveryCharge: 15,
  couponDiscount: 0,
  pointsUsed: 0,
  pointsDiscount: 0,
  total: 81,
  createdAt: '2026-01-01T10:00:00Z',
  placedAt: '2026-01-01T10:01:00Z',
  ...over,
});

const input = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  items: [{ bookId: 'b1', qty: 2, unitPrice: 30 }],
  address,
  redeemPoints: false,
  method: 'credit-card',
  cardNumber: '4242-4242-4242-4242',
  pricing: { subtotal: 60, tax: 6, delivery: 15, couponDiscount: 0, pointsDiscount: 0, total: 81 },
  ...over,
});

type Call = { method: string; path: string; body?: unknown; idempotencyKey?: string };

/** Fake API: creating an order returns a new pending order; paying returns whatever `pay` decides. */
const fakeClient = (pay: (call: Call, n: number) => unknown) => {
  const calls: Call[] = [];
  let created = 0;
  let payments = 0;
  const client: ApiClient = {
    request: vi.fn(async (method, path, options) => {
      const call: Call = { method, path, body: options?.body, idempotencyKey: options?.idempotencyKey };
      calls.push(call);
      if (method === 'POST' && path === '/orders') return apiOrder({ id: `o-${++created}`, status: 'pending_payment', placedAt: undefined });
      if (path.endsWith('/payments')) return pay(call, ++payments);
      return undefined;
    }) as ApiClient['request'],
  };
  return { client, calls };
};

describe('createApiClient', () => {
  const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

  it('sends the bearer token, JSON body and idempotency key', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }));
    const client = createApiClient('http://api.test/v1', async () => 'tkn', fetchImpl as unknown as typeof fetch);
    await client.request('POST', '/orders', { body: { a: 1 }, idempotencyKey: 'k-1234567890123456' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/orders');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tkn',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'k-1234567890123456',
    });
    expect(init.body).toBe('{"a":1}');
  });

  it('turns problem responses into ApiError with the server-provided detail', async () => {
    const fetchImpl = vi.fn(async () => json(409, { title: 'Conflict', detail: 'Only 1 copy left' }));
    const client = createApiClient('http://api.test/v1', async () => undefined, fetchImpl as unknown as typeof fetch);
    const err = await client.request('POST', '/orders').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect(errorMessage(err)).toBe('Only 1 copy left');
  });

  it('maps network failures to a generic message and handles 204', async () => {
    const down = createApiClient('http://api.test/v1', async () => undefined, (async () => {
      throw new TypeError('boom');
    }) as unknown as typeof fetch);
    const err = await down.request('GET', '/me').catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
    expect(errorMessage(err)).not.toContain('boom');
    expect(errorMessage(new Error('internal detail'))).toBe('Something went wrong. Please try again.');

    const empty = createApiClient('http://api.test/v1', async () => undefined, (async () => json(204)) as unknown as typeof fetch);
    await expect(empty.request('DELETE', '/me/wishlist/b1')).resolves.toBeUndefined();
  });
});

describe('mappers', () => {
  it('trims the address for the API', () => {
    expect(toApiAddress(address)).toMatchObject({ firstName: 'Maria', line1: 'Strada Lunga 12' });
  });

  it('maps a placed order and hides unpaid ones from the history', () => {
    const order = toOrder(apiOrder());
    expect(order).toMatchObject({ id: 'o-1', number: 'BW-000001', status: 'placed', pricing: { delivery: 15, total: 81 } });
    expect(order?.items).toEqual([{ bookId: 'b1', qty: 2, unitPrice: 30 }]);
    expect(toOrder(apiOrder({ status: 'pending_payment', placedAt: undefined }))).toBeNull();
    expect(toOrder(apiOrder({ status: 'cancelled', placedAt: undefined }))).toBeNull();
  });

  it('tokenizes cards without leaking the number, and the test card is declined', () => {
    const token = tokenizeCard('4242-4242-4242-4242');
    expect(token).toMatch(/^tok_[0-9a-f]{24}$/);
    expect(token).not.toContain('4242');
    expect(tokenizeCard('4000-0000-0000-0002')).toBe('tok_declined');
  });
});

describe('readApiConfig', () => {
  it('stays in demo mode without VITE_API_URL', () => {
    expect(readApiConfig({})).toBeNull();
    expect(readApiConfig({ VITE_API_URL: ' ' })).toBeNull();
  });

  it('reads the API and identity provider settings', () => {
    expect(readApiConfig({ VITE_API_URL: 'http://127.0.0.1:8080/api/v1/', VITE_OIDC_ISSUER: 'http://127.0.0.1:9000' })).toEqual({
      baseUrl: 'http://127.0.0.1:8080/api/v1',
      issuer: 'http://127.0.0.1:9000',
      clientId: 'bookworm-spa',
    });
  });

  it('requires an issuer when the API is configured', () => {
    expect(() => readApiConfig({ VITE_API_URL: 'http://127.0.0.1:8080/api/v1' })).toThrow(/VITE_OIDC_ISSUER/);
  });
});

describe('createApiCommerce.placeOrder', () => {
  it('creates the order with an idempotency key, then pays with a token (never the card number)', async () => {
    const { client, calls } = fakeClient(() => ({ status: 'succeeded', order: apiOrder() }));
    const result = await createApiCommerce(client).placeOrder(input());

    expect(result).toMatchObject({ order: { number: 'BW-000001' } });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /orders', 'POST /orders/o-1/payments']);
    expect(calls[0].idempotencyKey).toBeTruthy();
    expect(calls[1].idempotencyKey).toBeTruthy();
    expect(calls[1].idempotencyKey).not.toBe(calls[0].idempotencyKey);
    expect(JSON.stringify(calls)).not.toContain('4242');
    expect(calls[1].body).toMatchObject({ method: 'credit-card', paymentToken: expect.stringMatching(/^tok_/) });
  });

  it('keeps a declined order pending and reuses it on retry', async () => {
    const { client, calls } = fakeClient((_c, n) =>
      n === 1 ? { status: 'failed', failureReason: 'Card declined', order: apiOrder() } : { status: 'succeeded', order: apiOrder({ id: 'o-1' }) },
    );
    const commerce = createApiCommerce(client);

    expect(await commerce.placeOrder(input({ cardNumber: '4000 0000 0000 0002' }))).toEqual({ error: 'Card declined' });
    expect(await commerce.placeOrder(input({ method: 'cash-on-delivery', cardNumber: undefined }))).toMatchObject({ order: { id: 'o-1' } });

    expect(calls.filter((c) => c.path === '/orders')).toHaveLength(1);
    expect(calls.filter((c) => c.path === '/orders/o-1/payments')).toHaveLength(2);
  });

  it('discards the pending order and creates a new one when the checkout details change', async () => {
    const { client, calls } = fakeClient((_c, n) =>
      n === 1 ? { status: 'failed', failureReason: 'Card declined', order: apiOrder() } : { status: 'succeeded', order: apiOrder({ id: 'o-2' }) },
    );
    const commerce = createApiCommerce(client);

    await commerce.placeOrder(input());
    const result = await commerce.placeOrder(input({ redeemPoints: true }));

    expect(result).toMatchObject({ order: { id: 'o-2' } });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /orders',
      'POST /orders/o-1/payments',
      'POST /orders/o-1/cancel',
      'POST /orders',
      'POST /orders/o-2/payments',
    ]);
  });

  it('cancels the pending order when the payment dialog is closed', async () => {
    const { client, calls } = fakeClient(() => ({ status: 'failed', failureReason: 'Card declined', order: apiOrder() }));
    const commerce = createApiCommerce(client);
    await commerce.placeOrder(input());
    await commerce.discardPending();
    await commerce.discardPending(); // nothing left to cancel
    expect(calls.filter((c) => c.path.endsWith('/cancel'))).toHaveLength(1);
  });

  it('returns the server message when the order cannot be created and starts over after a conflict', async () => {
    const calls: string[] = [];
    let failNext = true;
    const client: ApiClient = {
      request: (async (method: string, path: string) => {
        calls.push(`${method} ${path}`);
        if (path === '/orders' && failNext) {
          failNext = false;
          throw new ApiError(409, 'Conflict', 'Only 1 copy of "T" is left');
        }
        if (path === '/orders') return apiOrder({ id: 'o-9', status: 'pending_payment', placedAt: undefined });
        return { status: 'succeeded', order: apiOrder({ id: 'o-9' }) };
      }) as ApiClient['request'],
    };
    const commerce = createApiCommerce(client);
    expect(await commerce.placeOrder(input())).toEqual({ error: 'Only 1 copy of "T" is left' });
    expect(await commerce.placeOrder(input())).toMatchObject({ order: { id: 'o-9' } });
  });
});

describe('createApiCommerce.cancelOrder', () => {
  it('resolves with undefined on success and a message on failure', async () => {
    const ok = createApiCommerce({ request: (async () => undefined) as ApiClient['request'] });
    expect(await ok.cancelOrder('o-1')).toBeUndefined();

    const late = createApiCommerce({
      request: (async () => {
        throw new ApiError(409, 'Conflict', 'The 48-hour cancellation window has passed');
      }) as ApiClient['request'],
    });
    expect(await late.cancelOrder('o-1')).toBe('The 48-hour cancellation window has passed');
  });
});
