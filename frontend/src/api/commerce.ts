import type { Commerce, PlaceOrderInput } from '../store/commerce';
import { ApiError, errorMessage, type ApiClient } from './client';
import { newIdempotencyKey, toApiAddress, toOrder, tokenizeCard, type ApiOrder } from './mappers';

interface ApiPayment {
  status: 'initiated' | 'succeeded' | 'failed' | 'refunded';
  failureReason?: string;
  order: ApiOrder;
}

/**
 * Checkout through the REST API: create the order (reserving stock and gift points), then pay for it.
 * A declined payment leaves the order pending so the customer can retry or pick another method.
 */
export const createApiCommerce = (client: ApiClient): Commerce => {
  let pending: { orderId: string; signature: string } | undefined;

  const discardPending = async () => {
    if (!pending) return;
    const { orderId } = pending;
    pending = undefined;
    try {
      await client.request('POST', `/orders/${orderId}/cancel`);
    } catch {
      /* the server expires unpaid orders on its own */
    }
  };

  return {
    discardPending,

    async placeOrder(input: PlaceOrderInput) {
      try {
        const address = toApiAddress(input.address);
        const signature = JSON.stringify([address, input.couponCode ?? null, input.redeemPoints]);
        if (pending && pending.signature !== signature) await discardPending();

        if (!pending) {
          const created = await client.request<ApiOrder>('POST', '/orders', {
            idempotencyKey: newIdempotencyKey(),
            body: {
              shippingAddress: { address, save: true },
              ...(input.couponCode ? { couponCode: input.couponCode } : {}),
              redeemGiftPoints: input.redeemPoints,
            },
          });
          pending = { orderId: created.id, signature };
        }

        const payment = await client.request<ApiPayment>('POST', `/orders/${pending.orderId}/payments`, {
          idempotencyKey: newIdempotencyKey(),
          body:
            input.method === 'credit-card' || input.method === 'debit-card'
              ? { method: input.method, paymentToken: tokenizeCard(input.cardNumber ?? '') }
              : { method: input.method },
        });
        if (payment.status === 'failed') return { error: payment.failureReason ?? 'Your payment could not be processed.' };

        pending = undefined;
        const order = toOrder(payment.order);
        return order ? { order } : { error: 'Your order could not be confirmed. Please check My Orders.' };
      } catch (err) {
        // The pending order is gone or no longer payable (e.g. it expired): start over next time.
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) pending = undefined;
        return { error: errorMessage(err) };
      }
    },

    async cancelOrder(orderId) {
      try {
        await client.request('POST', `/orders/${orderId}/cancel`);
        return undefined;
      } catch (err) {
        return errorMessage(err);
      }
    },
  };
};
