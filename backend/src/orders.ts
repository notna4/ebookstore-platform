import { randomBytes } from 'node:crypto';
import type { AuthUser } from './auth.js';
import type { Queryable } from './db.js';
import { conflict, notFound, unprocessable } from './errors.js';
import type { Gateway } from './gateway.js';
import { computeQuote, findCoupon, pointsEarned, type CartLine, type Quote } from './pricing.js';
import { insertAddress } from './routes/me.js';
import type { AddressInput } from './validate.js';
import type { z } from 'zod';
import type { createOrderRequest, paymentRequest } from './validate.js';

/** Store policy: an order can be cancelled within 48 hours of being placed. */
export const CANCELLATION_WINDOW_HOURS = 48;

const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
const optIso = (v: unknown): string | undefined => (v ? iso(v) : undefined);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
interface OrderRow {
  id: string;
  order_number: string;
  status: 'pending_payment' | 'placed' | 'delivered' | 'cancelled';
  shipping_address: Record<string, unknown>;
  subtotal: number;
  tax: number;
  delivery_charge: number;
  coupon_code: string | null;
  coupon_discount: number;
  points_used: number;
  points_discount: number;
  total: number;
  placed_at: Date | null;
  cancellable_until: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

const ORDER_COLUMNS = `id, order_number, status, shipping_address, subtotal::float8 AS subtotal, tax::float8 AS tax,
  delivery_charge::float8 AS delivery_charge, coupon_code, coupon_discount::float8 AS coupon_discount, points_used,
  points_discount::float8 AS points_discount, total::float8 AS total, placed_at, cancellable_until, delivered_at,
  cancelled_at, created_at`;

const toOrder = (
  o: OrderRow,
  items: { bookId: string; title: string; quantity: number; unitPrice: number }[],
  now: Date,
  paymentMethod?: string,
) => {
  const placedOpen = o.status === 'placed' && o.cancellable_until !== null;
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    ...(paymentMethod ? { paymentMethod } : {}),
    items,
    shippingAddress: o.shipping_address,
    subtotal: Number(o.subtotal),
    tax: Number(o.tax),
    deliveryCharge: Number(o.delivery_charge),
    ...(o.coupon_code ? { couponCode: o.coupon_code } : {}),
    couponDiscount: Number(o.coupon_discount),
    pointsUsed: o.points_used,
    pointsDiscount: Number(o.points_discount),
    total: Number(o.total),
    createdAt: iso(o.created_at),
    ...(o.placed_at ? { placedAt: iso(o.placed_at) } : {}),
    ...(placedOpen ? { cancellableUntil: iso(o.cancellable_until) } : {}),
    ...(o.cancelled_at ? { cancelledAt: iso(o.cancelled_at) } : {}),
    ...(o.delivered_at ? { deliveredAt: iso(o.delivered_at) } : {}),
    canCancel: placedOpen && new Date(o.cancellable_until!).getTime() > now.getTime(),
  };
};

export type OrderDto = ReturnType<typeof toOrder>;

const hydrate = async (q: Queryable, rows: OrderRow[]): Promise<OrderDto[]> => {
  if (rows.length === 0) return [];
  const items = await q.query<{ order_id: string; book_id: string; book_title: string; quantity: number; unit_price: number }>(
    `SELECT order_id, book_id, book_title, quantity, unit_price::float8 AS unit_price
       FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY book_title, book_id`,
    [rows.map((r) => r.id)],
  );
  // The payment that placed the order (failed attempts are ignored).
  const payments = await q.query<{ order_id: string; method: string }>(
    `SELECT DISTINCT ON (order_id) order_id, method FROM payments
      WHERE order_id = ANY($1::uuid[]) AND status <> 'failed' ORDER BY order_id, created_at DESC`,
    [rows.map((r) => r.id)],
  );
  const now = new Date();
  return rows.map((o) =>
    toOrder(
      o,
      items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ bookId: i.book_id, title: i.book_title, quantity: i.quantity, unitPrice: Number(i.unit_price) })),
      now,
      payments.find((p) => p.order_id === o.id)?.method,
    ),
  );
};

export const getOrder = async (q: Queryable, userId: string, orderId: string): Promise<OrderDto | undefined> => {
  const rows = await q.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
  return (await hydrate(q, rows))[0];
};

export const listOrders = async (q: Queryable, userId: string, page: number, pageSize: number) => {
  const [{ total } = { total: 0 }] = await q.query<{ total: number }>('SELECT count(*)::int AS total FROM orders WHERE user_id = $1', [userId]);
  const rows = await q.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );
  return { page, pageSize, total, items: await hydrate(q, rows) };
};

// ---------------------------------------------------------------------------
// Cart pricing
// ---------------------------------------------------------------------------
interface CartLineRow extends CartLine {
  title: string;
  stock: number | null;
}

/** Cart lines with prices; `lock` takes row locks on the books so stock can be reserved safely. */
const loadCartLines = async (q: Queryable, userId: string, lock: boolean): Promise<CartLineRow[]> => {
  const rows = await q.query<{ book_id: string; title: string; format: string; price: number; stock: number | null; quantity: number }>(
    `SELECT b.id AS book_id, b.title, b.format, b.price::float8 AS price, b.stock, ci.quantity
       FROM cart_items ci JOIN books b ON b.id = ci.book_id
      WHERE ci.user_id = $1 ORDER BY b.id ${lock ? 'FOR UPDATE OF b' : ''}`,
    [userId],
  );
  return rows.map((r) => ({
    bookId: r.book_id,
    title: r.title,
    format: r.format,
    price: Number(r.price),
    stock: r.stock,
    quantity: r.quantity,
  }));
};

const subtotalOf = (lines: CartLine[]): number => lines.reduce((s, l) => s + l.price * l.quantity, 0);

export const quoteCart = async (
  q: Queryable,
  userId: string,
  opts: { couponCode?: string; redeemGiftPoints: boolean },
): Promise<Quote> => {
  const lines = await loadCartLines(q, userId, false);
  if (lines.length === 0) throw unprocessable('Your cart is empty.');
  const coupon = opts.couponCode ? await findCoupon(q, opts.couponCode, subtotalOf(lines)) : undefined;
  const [u] = await q.query<{ gift_points: number }>('SELECT gift_points FROM users WHERE id = $1', [userId]);
  return computeQuote({ lines, coupon, pointsToRedeem: opts.redeemGiftPoints ? (u?.gift_points ?? 0) : 0 });
};

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------
const restoreStock = (tx: Queryable, orderId: string) =>
  tx.query(
    `UPDATE books b SET stock = b.stock + oi.quantity
       FROM order_items oi WHERE oi.order_id = $1 AND oi.book_id = b.id AND b.stock IS NOT NULL`,
    [orderId],
  );

const restorePoints = async (tx: Queryable, userId: string, orderId: string, points: number) => {
  if (points <= 0) return;
  await tx.query('UPDATE users SET gift_points = gift_points + $2 WHERE id = $1', [userId, points]);
  await tx.query(`INSERT INTO gift_point_transactions (user_id, order_id, reason, points) VALUES ($1, $2, 'restored', $3)`, [userId, orderId, points]);
};

/**
 * Cancels unpaid orders older than the TTL and releases their reserved stock and gift points.
 * Run it in its own transaction so the release is kept even when the triggering request fails.
 */
export const expireStaleOrders = async (tx: Queryable, ttlMinutes: number): Promise<number> => {
  const stale = await tx.query<{ id: string; user_id: string; points_used: number }>(
    `SELECT id, user_id, points_used FROM orders
      WHERE status = 'pending_payment' AND created_at < now() - make_interval(mins => $1::int)
      FOR UPDATE SKIP LOCKED`,
    [ttlMinutes],
  );
  for (const o of stale) {
    await restoreStock(tx, o.id);
    await restorePoints(tx, o.user_id, o.id, o.points_used);
    await tx.query(`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [o.id]);
  }
  return stale.length;
};

// ---------------------------------------------------------------------------
// Create order
// ---------------------------------------------------------------------------
type CreateOrderInput = z.output<typeof createOrderRequest>;

const newOrderNumber = (): string => `BW-${randomBytes(5).toString('hex').toUpperCase()}`;

const snapshotAddress = (a: AddressInput) => ({
  firstName: a.firstName,
  lastName: a.lastName,
  line1: a.line1,
  email: a.email,
  city: a.city,
  postalCode: a.postalCode,
  phoneCode: a.phoneCode,
  phone: a.phone,
  county: a.county,
  country: a.country,
});

export const createOrder = async (tx: Queryable, user: AuthUser, input: CreateOrderInput): Promise<OrderDto> => {
  const [u] = await tx.query<{ gift_points: number }>('SELECT gift_points FROM users WHERE id = $1 FOR UPDATE', [user.id]);

  const lines = await loadCartLines(tx, user.id, true);
  if (lines.length === 0) throw unprocessable('Your cart is empty.');
  for (const l of lines) {
    if (l.stock !== null && l.stock < l.quantity) throw unprocessable(`Not enough stock for "${l.title}".`);
  }

  // Shipping address: a saved one, or a new one (optionally saved to the address book).
  let address: AddressInput;
  if ('addressId' in input.shippingAddress) {
    const [row] = await tx.query<Record<string, string>>(
      `SELECT first_name, last_name, line1, email, city, postal_code, phone_code, phone, county, country
         FROM addresses WHERE id = $1 AND user_id = $2`,
      [input.shippingAddress.addressId, user.id],
    );
    if (!row) throw notFound('Address');
    address = {
      firstName: row.first_name!, lastName: row.last_name!, line1: row.line1!, email: row.email!, city: row.city!,
      postalCode: row.postal_code!, phoneCode: row.phone_code!, phone: row.phone!, county: row.county!, country: row.country!,
      isDefault: false,
    };
  } else {
    address = input.shippingAddress.address;
    if (input.shippingAddress.save) await insertAddress(tx, user.id, address);
  }

  const coupon = input.couponCode ? await findCoupon(tx, input.couponCode, subtotalOf(lines)) : undefined;
  if (coupon && !coupon.ok) throw unprocessable(coupon.error);
  const quote = computeQuote({ lines, coupon, pointsToRedeem: input.redeemGiftPoints ? u!.gift_points : 0 });

  const [order] = await tx.query<{ id: string }>(
    `INSERT INTO orders (order_number, user_id, shipping_address, subtotal, tax, delivery_charge, coupon_code,
                         coupon_discount, points_used, points_discount, total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      newOrderNumber(), user.id, JSON.stringify(snapshotAddress(address)), quote.subtotal, quote.tax, quote.deliveryCharge,
      quote.couponCode ?? null, quote.couponDiscount, quote.pointsUsed, quote.pointsDiscount, quote.total,
    ],
  );
  const orderId = order!.id;

  for (const l of lines) {
    await tx.query('INSERT INTO order_items (order_id, book_id, book_title, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)', [
      orderId, l.bookId, l.title, l.quantity, l.price,
    ]);
    if (l.stock !== null) await tx.query('UPDATE books SET stock = stock - $2 WHERE id = $1', [l.bookId, l.quantity]);
  }
  if (quote.pointsUsed > 0) {
    await tx.query('UPDATE users SET gift_points = gift_points - $2 WHERE id = $1', [user.id, quote.pointsUsed]);
    await tx.query(`INSERT INTO gift_point_transactions (user_id, order_id, reason, points) VALUES ($1, $2, 'redeemed', $3)`, [
      user.id, orderId, -quote.pointsUsed,
    ]);
  }
  return (await getOrder(tx, user.id, orderId))!;
};

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------
type PaymentInput = z.output<typeof paymentRequest>;

interface PaymentRow {
  id: string;
  order_id: string;
  method: string;
  status: string;
  amount: number;
  failure_reason: string | null;
  created_at: Date;
}

const toPayment = (p: PaymentRow, order: OrderDto) => ({
  id: p.id,
  orderId: p.order_id,
  method: p.method,
  status: p.status,
  amount: Number(p.amount),
  ...(p.failure_reason ? { failureReason: p.failure_reason } : {}),
  createdAt: iso(p.created_at),
  order,
});

const PAYMENT_COLUMNS = 'id, order_id, method, status, amount::float8 AS amount, failure_reason, created_at';

export const payOrder = async (
  tx: Queryable,
  user: AuthUser,
  orderId: string,
  input: PaymentInput,
  gateway: Gateway,
) => {
  const [order] = await tx.query<{ status: string; total: number }>(
    'SELECT status, total::float8 AS total FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [orderId, user.id],
  );
  if (!order) throw notFound('Order');
  if (order.status !== 'pending_payment') throw conflict('This order is not awaiting payment.');
  const total = Number(order.total);

  const record = async (status: 'initiated' | 'succeeded' | 'failed', reference: string | null, failure: string | null) => {
    const [p] = await tx.query<PaymentRow>(
      `INSERT INTO payments (order_id, method, status, amount, gateway_reference, failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PAYMENT_COLUMNS}`,
      [orderId, input.method, status, total, reference, failure],
    );
    return p!;
  };

  let reference: string | null = null;
  if (input.method === 'wallet') {
    const [u] = await tx.query<{ wallet_balance: number }>('SELECT wallet_balance::float8 AS wallet_balance FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    if (Number(u!.wallet_balance) < total) throw unprocessable('Your wallet balance is too low for this order.');
  } else if ('paymentToken' in input) {
    const result = gateway.charge(input.paymentToken, total);
    if (!result.ok) {
      // The attempt is recorded; the order stays pending so another method can be tried.
      return toPayment(await record('failed', null, result.reason), (await getOrder(tx, user.id, orderId))!);
    }
    reference = result.reference;
  }

  const payment = await record(input.method === 'cash-on-delivery' ? 'initiated' : 'succeeded', reference, null);

  if (input.method === 'wallet' && total > 0) {
    await tx.query('UPDATE users SET wallet_balance = wallet_balance - $2 WHERE id = $1', [user.id, total]);
    await tx.query(`INSERT INTO wallet_transactions (user_id, order_id, reason, amount) VALUES ($1, $2, 'order_payment', $3)`, [user.id, orderId, -total]);
  }
  await tx.query(
    `UPDATE orders SET status = 'placed', placed_at = now(), cancellable_until = now() + make_interval(hours => $2::int) WHERE id = $1`,
    [orderId, CANCELLATION_WINDOW_HOURS],
  );
  await tx.query(
    `UPDATE books b SET copies_sold = b.copies_sold + oi.quantity FROM order_items oi WHERE oi.order_id = $1 AND oi.book_id = b.id`,
    [orderId],
  );
  await tx.query('DELETE FROM cart_items WHERE user_id = $1', [user.id]);

  const earned = pointsEarned(total);
  if (earned > 0) {
    await tx.query('UPDATE users SET gift_points = gift_points + $2 WHERE id = $1', [user.id, earned]);
    await tx.query(`INSERT INTO gift_point_transactions (user_id, order_id, reason, points) VALUES ($1, $2, 'earned', $3)`, [user.id, orderId, earned]);
  }
  return toPayment(payment, (await getOrder(tx, user.id, orderId))!);
};

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------
export const cancelOrder = async (tx: Queryable, user: AuthUser, orderId: string): Promise<OrderDto> => {
  const [order] = await tx.query<{ status: string; points_used: number; window_open: boolean }>(
    `SELECT status, points_used, (cancellable_until IS NOT NULL AND cancellable_until > now()) AS window_open
       FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [orderId, user.id],
  );
  if (!order) throw notFound('Order');
  if (order.status === 'pending_payment') {
    // Abandoned checkout: nothing was paid, so only the reservation is released.
    await restoreStock(tx, orderId);
    await restorePoints(tx, user.id, orderId, order.points_used);
    await tx.query(`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [orderId]);
    return (await getOrder(tx, user.id, orderId))!;
  }
  if (order.status !== 'placed') throw conflict('Only orders that are awaiting payment or have been placed can be cancelled.');
  if (!order.window_open) throw conflict('The 48-hour cancellation window for this order has passed.');

  await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);

  // Refund what was paid. Cash on delivery was never collected, so there is nothing to refund.
  const [payment] = await tx.query<{ id: string; amount: number }>(
    `SELECT id, amount::float8 AS amount FROM payments
      WHERE order_id = $1 AND status = 'succeeded' AND method <> 'cash-on-delivery'`,
    [orderId],
  );
  if (payment && Number(payment.amount) > 0) {
    const amount = Number(payment.amount);
    await tx.query('UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1', [user.id, amount]);
    await tx.query(`INSERT INTO wallet_transactions (user_id, order_id, reason, amount) VALUES ($1, $2, 'order_refund', $3)`, [user.id, orderId, amount]);
    await tx.query(`UPDATE payments SET status = 'refunded', refunded_amount = amount WHERE id = $1`, [payment.id]);
  }

  await restoreStock(tx, orderId);
  await tx.query(
    `UPDATE books b SET copies_sold = GREATEST(0, b.copies_sold - oi.quantity) FROM order_items oi WHERE oi.order_id = $1 AND oi.book_id = b.id`,
    [orderId],
  );
  await restorePoints(tx, user.id, orderId, order.points_used);

  // Points earned by this order are taken back, but never beyond the current balance.
  const [earned] = await tx.query<{ points: number }>(
    `SELECT COALESCE(sum(points), 0)::int AS points FROM gift_point_transactions WHERE order_id = $1 AND reason = 'earned'`,
    [orderId],
  );
  const [u] = await tx.query<{ gift_points: number }>('SELECT gift_points FROM users WHERE id = $1', [user.id]);
  const revoke = Math.min(earned?.points ?? 0, u!.gift_points);
  if (revoke > 0) {
    await tx.query('UPDATE users SET gift_points = gift_points - $2 WHERE id = $1', [user.id, revoke]);
    await tx.query(`INSERT INTO gift_point_transactions (user_id, order_id, reason, points) VALUES ($1, $2, 'revoked', $3)`, [user.id, orderId, -revoke]);
  }

  await tx.query(`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [orderId]);
  return (await getOrder(tx, user.id, orderId))!;
};

// ---------------------------------------------------------------------------
// Buy it again
// ---------------------------------------------------------------------------
export const buyAgain = async (tx: Queryable, user: AuthUser, orderId: string): Promise<void> => {
  const [order] = await tx.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', [orderId, user.id]);
  if (!order) throw notFound('Order');
  await tx.query(
    `INSERT INTO cart_items (user_id, book_id, quantity)
     SELECT $2, oi.book_id, oi.quantity FROM order_items oi WHERE oi.order_id = $1
     ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = LEAST(10, cart_items.quantity + EXCLUDED.quantity)`,
    [orderId, user.id],
  );
};
