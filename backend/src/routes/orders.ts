import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { currentUser, requireAuth, type TokenVerifier } from '../auth.js';
import { getCart } from '../cart.js';
import { notFound } from '../errors.js';
import type { Gateway } from '../gateway.js';
import { withIdempotency } from '../idempotency.js';
import { buyAgain, cancelOrder, createOrder, expireStaleOrders, getOrder, listOrders, payOrder, quoteCart } from '../orders.js';
import { createOrderRequest, pageQuery, parse, paymentRequest, quoteRequest, uuid } from '../validate.js';

export interface OrderRouteOptions {
  gateway: Gateway;
  pendingOrderTtlMinutes: number;
  /** Extra middleware (e.g. a stricter rate limit) for endpoints that move money or stock. */
  sensitive: RequestHandler[];
}

const orderId = (params: unknown): string => parse(z.object({ orderId: uuid }), params).orderId;

export const orderRouter = (db: Db, verify: TokenVerifier, opts: OrderRouteOptions): Router => {
  const r = Router();
  r.use(['/checkout', '/orders'], requireAuth(db, verify));
  const expireUnpaid = () => db.transaction((tx) => expireStaleOrders(tx, opts.pendingOrderTtlMinutes));

  r.post('/checkout/quote', async (req, res) => {
    const input = parse(quoteRequest, req.body);
    res.json(await quoteCart(db, currentUser(req).id, input));
  });

  r.get('/orders', async (req, res) => {
    const { page, pageSize } = parse(pageQuery, req.query);
    res.json(await listOrders(db, currentUser(req).id, page, pageSize));
  });

  r.post('/orders', ...opts.sensitive, async (req, res) => {
    const user = currentUser(req);
    const input = parse(createOrderRequest, req.body);
    await expireUnpaid();
    await withIdempotency(db, req, res, user.id, 'POST /orders', async (tx) => ({
      status: 201,
      body: await createOrder(tx, user, input),
    }));
  });

  r.get('/orders/:orderId', async (req, res) => {
    const order = await getOrder(db, currentUser(req).id, orderId(req.params));
    if (!order) throw notFound('Order');
    res.json(order);
  });

  r.post('/orders/:orderId/payments', ...opts.sensitive, async (req, res) => {
    const user = currentUser(req);
    const id = orderId(req.params);
    const input = parse(paymentRequest, req.body);
    await expireUnpaid();
    await withIdempotency(db, req, res, user.id, `POST /orders/${id}/payments`, async (tx) => ({
      status: 201,
      body: await payOrder(tx, user, id, input, opts.gateway),
    }));
  });

  r.post('/orders/:orderId/cancel', ...opts.sensitive, async (req, res) => {
    const user = currentUser(req);
    res.json(await db.transaction((tx) => cancelOrder(tx, user, orderId(req.params))));
  });

  r.post('/orders/:orderId/buy-again', async (req, res) => {
    const user = currentUser(req);
    res.json(
      await db.transaction(async (tx) => {
        await buyAgain(tx, user, orderId(req.params));
        return getCart(tx, user.id);
      }),
    );
  });

  return r;
};
