import type { Address, Order, OrderItem, PaymentMethod, Pricing } from '../types';

export interface PlaceOrderInput {
  items: OrderItem[];
  address: Address;
  /** Coupon that was applied at checkout, if any. */
  couponCode?: string;
  redeemPoints: boolean;
  method: PaymentMethod;
  /** Card number for card payments; exchanged for a gateway token and never stored or sent as-is. */
  cardNumber?: string;
  /** Prices as shown to the customer (the API recomputes them authoritatively). */
  pricing: Pricing;
}

export type PlaceOrderResult = { order: Order } | { error: string };

/** Operations that change money, stock or order state. Implemented locally (demo) or through the API. */
export interface Commerce {
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  /** Resolves with an error message, or undefined on success. */
  cancelOrder(orderId: string): Promise<string | undefined>;
  /** Drops an order that was created but never paid (e.g. the payment dialog was closed). */
  discardPending(): Promise<void>;
}
