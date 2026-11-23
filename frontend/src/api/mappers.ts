import type { Address, CartItem, Order, OrderStatus, PaymentMethod, Review } from '../types';

// Shapes returned by the REST API (see api/openapi.yaml).
export interface ApiAddress {
  firstName: string;
  lastName: string;
  line1: string;
  email: string;
  city: string;
  postalCode: string;
  phoneCode: string;
  phone: string;
  county: string;
  country: string;
}

export interface ApiOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus | 'pending_payment';
  paymentMethod?: PaymentMethod;
  items: { bookId: string; title: string; quantity: number; unitPrice: number }[];
  shippingAddress: ApiAddress;
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  couponCode?: string;
  couponDiscount: number;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  createdAt: string;
  placedAt?: string;
}

export interface ApiCart {
  items: { book: { id: string }; quantity: number }[];
}

export interface ApiReview {
  id: string;
  bookId: string;
  authorName: string;
  rating: number;
  text: string;
  createdAt: string;
}

export const toAddress = (a: ApiAddress): Address => ({
  firstName: a.firstName,
  lastName: a.lastName,
  address: a.line1,
  email: a.email,
  city: a.city,
  postalCode: a.postalCode,
  phoneCode: a.phoneCode,
  phone: a.phone,
  county: a.county,
  country: a.country,
});

export const toApiAddress = (a: Address): ApiAddress => ({
  firstName: a.firstName.trim(),
  lastName: a.lastName.trim(),
  line1: a.address.trim(),
  email: a.email.trim(),
  city: a.city.trim(),
  postalCode: a.postalCode.trim(),
  phoneCode: a.phoneCode,
  phone: a.phone.trim(),
  county: a.county.trim(),
  country: a.country.trim(),
});

/** Orders that never reached payment (still pending, or abandoned) are not part of the customer's history. */
export const toOrder = (o: ApiOrder): Order | null => {
  if (!o.placedAt || o.status === 'pending_payment') return null;
  return {
    id: o.id,
    number: o.orderNumber,
    items: o.items.map((i) => ({ bookId: i.bookId, qty: i.quantity, unitPrice: i.unitPrice })),
    pricing: {
      subtotal: o.subtotal,
      tax: o.tax,
      delivery: o.deliveryCharge,
      couponDiscount: o.couponDiscount,
      pointsDiscount: o.pointsDiscount,
      total: o.total,
    },
    address: toAddress(o.shippingAddress),
    paymentMethod: o.paymentMethod ?? 'wallet',
    status: o.status,
    placedAt: o.placedAt,
    couponCode: o.couponCode,
    pointsUsed: o.pointsUsed,
  };
};

export const toCartItems = (cart: ApiCart): CartItem[] => cart.items.map((i) => ({ bookId: i.book.id, qty: i.quantity }));

export const toReview = (r: ApiReview): Review => ({
  id: r.id,
  bookId: r.bookId,
  author: r.authorName,
  rating: r.rating,
  text: r.text,
  createdAt: r.createdAt,
});

/**
 * Stand-in for the payment gateway's client SDK: card details are exchanged for a single-use token
 * in the browser and only the token is sent to the API. In this local setup the simulated gateway
 * declines the test card 4000 0000 0000 0002 (`tok_declined`).
 */
export const tokenizeCard = (cardNumber: string): string => {
  if (cardNumber.replace(/\D/g, '') === '4000000000000002') return 'tok_declined';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `tok_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
};

/** Random key that makes a retried POST safe (16-64 chars, URL-safe). */
export const newIdempotencyKey = (): string => crypto.randomUUID();
