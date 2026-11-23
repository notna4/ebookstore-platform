import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, validAddress, type Session, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext({ pendingOrderTtlMinutes: 30 });
});
afterAll(() => ctx.close());

const api = (path: string) => `/api/v1${path}`;

const fillCart = async (s: Session, items: Record<string, number>) => {
  for (const [id, quantity] of Object.entries(items)) {
    const res = await ctx.api.put(api(`/me/cart/items/${id}`)).set(s.auth).send({ quantity });
    expect(res.status).toBe(200);
  }
};

const newOrder = (s: Session, body: object = {}, key?: string) => {
  const req = ctx.api.post(api('/orders')).set(s.auth);
  if (key) req.set('Idempotency-Key', key);
  return req.send({ shippingAddress: { address: validAddress }, ...body });
};

const pay = (s: Session, orderId: string, body: object, key?: string) => {
  const req = ctx.api.post(api(`/orders/${orderId}/payments`)).set(s.auth);
  if (key) req.set('Idempotency-Key', key);
  return req.send(body);
};

const me = async (s: Session) => (await ctx.api.get(api('/me')).set(s.auth)).body as { walletBalance: number; giftPoints: number };
const stockOf = async (id: string) => (await ctx.db.query<{ stock: number | null }>('SELECT stock FROM books WHERE id = $1', [id]))[0]!.stock;
const key = () => `k-${crypto.randomUUID()}`;

/** A signed-in user with joy-of-minimalism (30) + the-path-to-success (70) in the cart: subtotal 100. */
const shopper = async () => {
  const s = await ctx.login();
  await fillCart(s, { 'joy-of-minimalism': 1, 'the-path-to-success': 1 });
  return s;
};

describe('checkout quote', () => {
  it('adds 11% VAT and charges delivery below 100 RON', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'joy-of-minimalism': 1 });
    const res = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subtotal: 30, tax: 3.3, deliveryCharge: 15, couponDiscount: 0, pointsUsed: 0, pointsDiscount: 0, total: 48.3 });
  });

  it('delivers free from 100 RON and for all-eBook carts', async () => {
    const s = await shopper();
    const full = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({});
    expect(full.body).toMatchObject({ subtotal: 100, tax: 11, deliveryCharge: 0, total: 111 });

    const d = await ctx.login();
    await fillCart(d, { 'the-vanishing-house': 1 });
    const digital = await ctx.api.post(api('/checkout/quote')).set(d.auth).send({});
    expect(digital.body).toMatchObject({ subtotal: 20, tax: 2.2, deliveryCharge: 0, total: 22.2 });
  });

  it('applies BOOKWORM20 (min 80) and READ10 (capped at 30)', async () => {
    const s = await shopper();
    const flat = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ couponCode: 'bookworm20' });
    expect(flat.body).toMatchObject({ couponCode: 'BOOKWORM20', couponDiscount: 20, total: 91 });
    expect(flat.body.couponError).toBeUndefined();

    const pct = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ couponCode: 'READ10' });
    expect(pct.body).toMatchObject({ couponDiscount: 10, total: 101 });

    await fillCart(s, { 'the-ember-crown': 3 });
    const capped = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ couponCode: 'READ10' });
    expect(capped.body.couponDiscount).toBe(30);
  });

  it('reports coupon problems without failing the quote', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'joy-of-minimalism': 1 });
    const low = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ couponCode: 'BOOKWORM20' });
    expect(low.status).toBe(200);
    expect(low.body.couponError).toBe('Add items worth 50.00 RON more to use this coupon');
    expect(low.body.couponDiscount).toBe(0);

    const bad = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ couponCode: 'NOPE123' });
    expect(bad.body.couponError).toBe('Invalid coupon code');
  });

  it('redeems whole gift points up to the payable amount', async () => {
    const s = await ctx.login(); // starts with 50 points
    await fillCart(s, { 'joy-of-minimalism': 1 });
    const small = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ redeemGiftPoints: true });
    expect(small.body).toMatchObject({ total: 0.3, pointsUsed: 48, pointsDiscount: 48 });

    await fillCart(s, { 'the-path-to-success': 1 });
    const big = await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ redeemGiftPoints: true });
    expect(big.body).toMatchObject({ pointsUsed: 50, pointsDiscount: 50, total: 61 });
  });

  it('rejects an empty cart and malformed input', async () => {
    const s = await ctx.login();
    expect((await ctx.api.post(api('/checkout/quote')).set(s.auth).send({})).status).toBe(422);
    expect((await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ couponCode: 'a b' })).status).toBe(400);
    expect((await ctx.api.post(api('/checkout/quote')).set(s.auth).send({ discount: 99 })).status).toBe(400);
    expect((await ctx.api.post(api('/checkout/quote')).send({})).status).toBe(401);
  });
});

describe('creating an order', () => {
  it('snapshots prices, address and totals, and reserves stock without clearing the cart', async () => {
    const s = await shopper();
    const before = await stockOf('joy-of-minimalism');
    const res = await newOrder(s, { couponCode: 'BOOKWORM20' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending_payment',
      subtotal: 100,
      tax: 11,
      deliveryCharge: 0,
      couponCode: 'BOOKWORM20',
      couponDiscount: 20,
      total: 91,
      canCancel: false,
      shippingAddress: { city: 'București', postalCode: '030031' },
    });
    expect(res.body.orderNumber).toMatch(/^BW-[0-9A-F]{10}$/);
    expect(res.body.items).toEqual([
      { bookId: 'joy-of-minimalism', title: 'Joy of Minimalism', quantity: 1, unitPrice: 30 },
      { bookId: 'the-path-to-success', title: 'The Path to Success', quantity: 1, unitPrice: 70 },
    ]);
    expect(await stockOf('joy-of-minimalism')).toBe(before! - 1);
    expect((await ctx.api.get(api('/me/cart')).set(s.auth)).body.itemCount).toBe(2);
  });

  it('reserves gift points when redeeming', async () => {
    const s = await shopper();
    const res = await newOrder(s, { redeemGiftPoints: true });
    expect(res.body).toMatchObject({ pointsUsed: 50, pointsDiscount: 50, total: 61 });
    expect((await me(s)).giftPoints).toBe(0);
  });

  it('uses a saved address, or saves a new one on request', async () => {
    const s = await shopper();
    const saved = await ctx.api.post(api('/me/addresses')).set(s.auth).send({ ...validAddress, city: 'Brașov' });
    const bySaved = await newOrder(s, { shippingAddress: { addressId: saved.body.id } });
    expect(bySaved.status).toBe(201);
    expect(bySaved.body.shippingAddress.city).toBe('Brașov');

    const s2 = await shopper();
    await newOrder(s2, { shippingAddress: { address: validAddress, save: true } });
    expect((await ctx.api.get(api('/me/addresses')).set(s2.auth)).body).toHaveLength(1);
    const s3 = await shopper();
    await newOrder(s3);
    expect((await ctx.api.get(api('/me/addresses')).set(s3.auth)).body).toHaveLength(0);
  });

  it('rejects an empty cart, bad coupons, unknown or foreign addresses and invalid input', async () => {
    const empty = await ctx.login();
    expect((await newOrder(empty)).status).toBe(422);

    const s = await shopper();
    expect((await newOrder(s, { couponCode: 'NOPE123' })).status).toBe(422);
    expect((await newOrder(s, { shippingAddress: { addressId: crypto.randomUUID() } })).status).toBe(404);

    const other = await ctx.login();
    const theirs = await ctx.api.post(api('/me/addresses')).set(other.auth).send(validAddress);
    expect((await newOrder(s, { shippingAddress: { addressId: theirs.body.id } })).status).toBe(404);

    expect((await newOrder(s, { shippingAddress: { address: { ...validAddress, postalCode: '1' } } })).status).toBe(400);
    expect((await newOrder(s, { shippingAddress: { addressId: theirs.body.id, address: validAddress } })).status).toBe(400);
    expect((await newOrder(s, { total: 1 })).status).toBe(400);
  });

  it('refuses to oversell physical stock', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'paper-tigers': 2 });
    await ctx.db.query('UPDATE books SET stock = 1 WHERE id = $1', ['paper-tigers']);
    const res = await newOrder(s);
    expect(res.status).toBe(422);
    expect(await stockOf('paper-tigers')).toBe(1);
  });

  it('never limits eBooks by stock', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'the-vanishing-house': 10 });
    expect((await newOrder(s)).status).toBe(201);
    expect(await stockOf('the-vanishing-house')).toBeNull();
  });

  it('replays the same order for a repeated Idempotency-Key and rejects a changed payload', async () => {
    const s = await shopper();
    const k = key();
    const before = await stockOf('the-path-to-success');
    const first = await newOrder(s, {}, k);
    const second = await newOrder(s, {}, k);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await stockOf('the-path-to-success')).toBe(before! - 1);
    expect((await ctx.api.get(api('/orders')).set(s.auth)).body.total).toBe(1);

    const changed = await newOrder(s, { couponCode: 'READ10' }, k);
    expect(changed.status).toBe(422);
    expect((await newOrder(s, {}, 'short')).status).toBe(400);
  });
});

describe('paying for an order', () => {
  it('places the order, charges the wallet, clears the cart and awards points', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    const res = await pay(s, order.id, { method: 'wallet' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ method: 'wallet', status: 'succeeded', amount: 111, orderId: order.id });
    expect(res.body.order).toMatchObject({ status: 'placed', canCancel: true, paymentMethod: 'wallet' });

    const placed = new Date(res.body.order.placedAt).getTime();
    const until = new Date(res.body.order.cancellableUntil).getTime();
    expect(until - placed).toBe(48 * 3_600_000);

    expect(await me(s)).toEqual(expect.objectContaining({ walletBalance: 89, giftPoints: 61 })); // +floor(111/10)
    expect((await ctx.api.get(api('/me/cart')).set(s.auth)).body.itemCount).toBe(0);

    const ledger = (await ctx.api.get(api('/me/wallet/transactions')).set(s.auth)).body;
    expect(ledger.balance).toBe(89);
    expect(ledger.items[0]).toMatchObject({ reason: 'order_payment', amount: -111, orderId: order.id });
  });

  it('increments copies sold on placement', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'sixteen-summers': 2 });
    const before = (await ctx.api.get(api('/books/sixteen-summers'))).body.copiesSold;
    const order = (await newOrder(s)).body;
    expect((await ctx.api.get(api('/books/sixteen-summers'))).body.copiesSold).toBe(before);
    await pay(s, order.id, { method: 'cash-on-delivery' });
    expect((await ctx.api.get(api('/books/sixteen-summers'))).body.copiesSold).toBe(before + 2);
  });

  it('refuses a wallet payment the balance cannot cover and keeps the order payable', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'the-ember-crown': 2 }); // 220 + 24.20 VAT = 244.20 > 200
    const order = (await newOrder(s)).body;
    expect(order.total).toBe(244.2);
    const res = await pay(s, order.id, { method: 'wallet' });
    expect(res.status).toBe(422);
    expect((await ctx.api.get(api(`/orders/${order.id}`)).set(s.auth)).body.status).toBe('pending_payment');
    expect((await me(s)).walletBalance).toBe(200);

    const cod = await pay(s, order.id, { method: 'cash-on-delivery' });
    expect(cod.status).toBe(201);
    expect(cod.body.order.status).toBe('placed');
  });

  it('records a declined card, leaves the order pending, and accepts a retry with another token', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    const declined = await pay(s, order.id, { method: 'credit-card', paymentToken: 'tok_declined' });
    expect(declined.status).toBe(201);
    expect(declined.body).toMatchObject({ status: 'failed', failureReason: 'Your card was declined.' });
    expect(declined.body.order.status).toBe('pending_payment');
    expect((await ctx.api.get(api('/me/cart')).set(s.auth)).body.itemCount).toBe(2);

    const ok = await pay(s, order.id, { method: 'credit-card', paymentToken: 'tok_visa_4242' });
    expect(ok.body).toMatchObject({ status: 'succeeded', amount: 111 });
    expect(ok.body.order.status).toBe('placed');
    expect((await me(s)).walletBalance).toBe(200); // cards do not touch the wallet
  });

  it('accepts debit cards and rejects invalid tokens without ever taking card numbers', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    expect((await pay(s, order.id, { method: 'debit-card' })).status).toBe(400);
    expect((await pay(s, order.id, { method: 'credit-card', paymentToken: 'short' })).status).toBe(400);
    expect((await pay(s, order.id, { method: 'credit-card', paymentToken: 'tok_ok_123', cardNumber: '4111111111111111' })).status).toBe(400);
    const bad = await pay(s, order.id, { method: 'debit-card', paymentToken: '4111111111111111' });
    expect(bad.body.status).toBe('failed');
    expect((await pay(s, order.id, { method: 'debit-card', paymentToken: 'tok_debit_001' })).body.status).toBe('succeeded');
  });

  it('places cash-on-delivery orders without collecting money', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    const res = await pay(s, order.id, { method: 'cash-on-delivery' });
    expect(res.body).toMatchObject({ method: 'cash-on-delivery', status: 'initiated', amount: 111 });
    expect(res.body.order.status).toBe('placed');
    expect((await me(s)).walletBalance).toBe(200);
  });

  it('rejects unknown methods, paying twice, and concurrent double payment', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    expect((await pay(s, order.id, { method: 'upi' })).status).toBe(400);

    const [a, b] = await Promise.all([pay(s, order.id, { method: 'wallet' }), pay(s, order.id, { method: 'wallet' })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await me(s)).walletBalance).toBe(89); // charged exactly once
    expect((await pay(s, order.id, { method: 'wallet' })).status).toBe(409);
  });

  it('does not charge twice for a repeated Idempotency-Key', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    const k = key();
    const first = await pay(s, order.id, { method: 'wallet' }, k);
    const second = await pay(s, order.id, { method: 'wallet' }, k);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect((await me(s)).walletBalance).toBe(89);
  });

  it('expires unpaid orders and releases the stock and gift points they held', async () => {
    const s = await shopper();
    const stock = await stockOf('joy-of-minimalism');
    const order = (await newOrder(s, { redeemGiftPoints: true })).body;
    expect(await stockOf('joy-of-minimalism')).toBe(stock! - 1);
    expect((await me(s)).giftPoints).toBe(0);

    await ctx.db.query(`UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = $1`, [order.id]);
    const late = await pay(s, order.id, { method: 'wallet' });
    expect(late.status).toBe(409);

    expect(await stockOf('joy-of-minimalism')).toBe(stock);
    expect((await me(s)).giftPoints).toBe(50);
    const after = (await ctx.api.get(api(`/orders/${order.id}`)).set(s.auth)).body;
    expect(after.status).toBe('cancelled');
  });
});

describe('cancelling an order', () => {
  it('refunds the wallet, restocks, and reverses points within 48 hours', async () => {
    const s = await shopper();
    const stock = await stockOf('joy-of-minimalism');
    const sold = (await ctx.api.get(api('/books/joy-of-minimalism'))).body.copiesSold;
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'wallet' });
    expect(await me(s)).toEqual(expect.objectContaining({ walletBalance: 89, giftPoints: 61 }));

    const res = await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', canCancel: false });
    expect(res.body.cancelledAt).toBeDefined();
    expect(res.body.cancellableUntil).toBeUndefined();

    expect(await me(s)).toEqual(expect.objectContaining({ walletBalance: 200, giftPoints: 50 }));
    expect(await stockOf('joy-of-minimalism')).toBe(stock);
    expect((await ctx.api.get(api('/books/joy-of-minimalism'))).body.copiesSold).toBe(sold);

    const reasons = (await ctx.api.get(api('/me/wallet/transactions')).set(s.auth)).body.items.map((t: { reason: string }) => t.reason);
    expect(reasons).toContain('order_refund');
  });

  it('restores redeemed gift points', async () => {
    const s = await shopper();
    const order = (await newOrder(s, { redeemGiftPoints: true })).body; // 50 points, total 61
    await pay(s, order.id, { method: 'wallet' });
    expect(await me(s)).toEqual(expect.objectContaining({ walletBalance: 139, giftPoints: 6 })); // earned floor(61/10)
    await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    expect(await me(s)).toEqual(expect.objectContaining({ walletBalance: 200, giftPoints: 50 }));
  });

  it('does not refund a cash-on-delivery order, as nothing was collected', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'cash-on-delivery' });
    const res = await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    expect(res.body.status).toBe('cancelled');
    expect((await me(s)).walletBalance).toBe(200);
  });

  it('refuses after the 48-hour window, for unpaid, and for already cancelled orders', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;

    await pay(s, order.id, { method: 'wallet' });
    await ctx.db.query(`UPDATE orders SET cancellable_until = now() - interval '1 minute' WHERE id = $1`, [order.id]);
    const late = await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    expect(late.status).toBe(409);
    const view = (await ctx.api.get(api(`/orders/${order.id}`)).set(s.auth)).body;
    expect(view).toMatchObject({ status: 'placed', canCancel: false });

    const s2 = await shopper();
    const o2 = (await newOrder(s2)).body;
    await pay(s2, o2.id, { method: 'wallet' });
    expect((await ctx.api.post(api(`/orders/${o2.id}/cancel`)).set(s2.auth)).status).toBe(200);
    expect((await ctx.api.post(api(`/orders/${o2.id}/cancel`)).set(s2.auth)).status).toBe(409);
    expect((await me(s2)).walletBalance).toBe(200); // not refunded twice
  });

  it('releases the stock and gift points of an unpaid order without refunding anything', async () => {
    const s = await shopper();
    const stock = await stockOf('joy-of-minimalism');
    const order = (await newOrder(s, { redeemGiftPoints: true })).body;
    expect(await stockOf('joy-of-minimalism')).toBe(stock! - 1);
    expect((await me(s)).giftPoints).toBe(0);

    const res = await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(await stockOf('joy-of-minimalism')).toBe(stock);
    expect(await me(s)).toEqual(expect.objectContaining({ walletBalance: 200, giftPoints: 50 }));
    expect((await pay(s, order.id, { method: 'wallet' })).status).toBe(409);
  });

  it('never drives gift points negative when the earned points were already spent', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'wallet' }); // 50 + 11 points
    await ctx.db.query('UPDATE users SET gift_points = 3 WHERE id = (SELECT user_id FROM orders WHERE id = $1)', [order.id]);
    const res = await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    expect(res.status).toBe(200);
    expect((await me(s)).giftPoints).toBe(0);
  });
});

describe('order history, Buy It Again and recommendations', () => {
  it('lists the newest orders first with pagination', async () => {
    const s = await ctx.login();
    for (const id of ['joy-of-minimalism', 'act-three']) {
      await fillCart(s, { [id]: 1 });
      const o = (await newOrder(s)).body;
      await pay(s, o.id, { method: 'cash-on-delivery' });
    }
    const page = await ctx.api.get(api('/orders?pageSize=1&page=1')).set(s.auth);
    expect(page.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(page.body.items[0].items[0].bookId).toBe('act-three');
    const second = await ctx.api.get(api('/orders?pageSize=1&page=2')).set(s.auth);
    expect(second.body.items[0].items[0].bookId).toBe('joy-of-minimalism');
  });

  it('puts every book of a past order back into the cart', async () => {
    const s = await shopper();
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'wallet' });
    expect((await ctx.api.get(api('/me/cart')).set(s.auth)).body.itemCount).toBe(0);

    const res = await ctx.api.post(api(`/orders/${order.id}/buy-again`)).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ itemCount: 2, subtotal: 100 });

    const again = await ctx.api.post(api(`/orders/${order.id}/buy-again`)).set(s.auth);
    expect(again.body.itemCount).toBe(4); // quantities add up
  });

  it('caps Buy It Again quantities at 10', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'act-three': 8 });
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'cash-on-delivery' });
    await ctx.api.post(api(`/orders/${order.id}/buy-again`)).set(s.auth);
    const cart = (await ctx.api.post(api(`/orders/${order.id}/buy-again`)).set(s.auth)).body;
    expect(cart.items[0].quantity).toBe(10);
  });

  it('recommends books like those bought before, excluding purchases', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'joy-of-minimalism': 1 });
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'cash-on-delivery' });
    const recs = (await ctx.api.get(api('/me/recommendations?limit=3')).set(s.auth)).body as { id: string; categoryId: string; author: { id: string } }[];
    expect(recs).toHaveLength(3);
    expect(recs.map((b) => b.id)).not.toContain('joy-of-minimalism');
    expect(recs.every((b) => b.categoryId === 'self-help' || b.author.id === 'daniel-reed')).toBe(true);
  });

  it('ignores cancelled orders when recommending', async () => {
    const s = await ctx.login();
    await fillCart(s, { 'joy-of-minimalism': 1 });
    const order = (await newOrder(s)).body;
    await pay(s, order.id, { method: 'cash-on-delivery' });
    await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(s.auth);
    const recs = (await ctx.api.get(api('/me/recommendations?limit=24')).set(s.auth)).body;
    expect(recs.map((b: { id: string }) => b.id)).toContain('joy-of-minimalism');
  });
});

describe('order access control', () => {
  it("hides other users' orders and blocks every action on them", async () => {
    const owner = await shopper();
    const intruder = await ctx.login();
    const order = (await newOrder(owner)).body;
    await pay(owner, order.id, { method: 'wallet' });

    expect((await ctx.api.get(api(`/orders/${order.id}`)).set(intruder.auth)).status).toBe(404);
    expect((await ctx.api.post(api(`/orders/${order.id}/cancel`)).set(intruder.auth)).status).toBe(404);
    expect((await ctx.api.post(api(`/orders/${order.id}/buy-again`)).set(intruder.auth)).status).toBe(404);
    expect((await pay(intruder, order.id, { method: 'wallet' })).status).toBe(404);
    expect((await ctx.api.get(api('/orders')).set(intruder.auth)).body.total).toBe(0);
    expect((await ctx.api.get(api(`/orders/${order.id}`)).set(owner.auth)).status).toBe(200);
  });

  it('requires authentication and well-formed ids', async () => {
    expect((await ctx.api.get(api('/orders'))).status).toBe(401);
    expect((await ctx.api.post(api('/orders')).send({})).status).toBe(401);
    const s = await ctx.login();
    expect((await ctx.api.get(api('/orders/not-a-uuid')).set(s.auth)).status).toBe(400);
    expect((await ctx.api.get(api(`/orders/${crypto.randomUUID()}`)).set(s.auth)).status).toBe(404);
  });
});
