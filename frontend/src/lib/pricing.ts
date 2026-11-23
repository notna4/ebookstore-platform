import { bookById } from '../data/books';
import type { CartItem, Pricing } from '../types';
import { formatPrice } from './format';

/** Romanian reduced VAT rate (TVA) applied to books. */
export const TAX_RATE = 0.11;
export const FREE_DELIVERY_THRESHOLD = 100;
export const DELIVERY_FEE = 15;

/** Round to 2 decimals (bani). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** 1 gift point = 1 RON */
export const POINT_VALUE = 1;

interface Coupon {
  code: string;
  minSubtotal: number;
  discount: (subtotal: number) => number;
  description: string;
}

export const coupons: Coupon[] = [
  { code: 'BOOKWORM20', minSubtotal: 80, discount: () => 20, description: `${formatPrice(20)} off orders above ${formatPrice(80)}` },
  { code: 'READ10', minSubtotal: 0, discount: (s) => Math.min(30, round2(s * 0.1)), description: `10% off, up to ${formatPrice(30)}` },
];

export type CouponResult = { ok: true; coupon: Coupon } | { ok: false; error: string };

export const findCoupon = (code: string, subtotal: number): CouponResult => {
  const coupon = coupons.find((c) => c.code === code.trim().toUpperCase());
  if (!coupon) return { ok: false, error: 'Invalid coupon code' };
  if (subtotal < coupon.minSubtotal) {
    return { ok: false, error: `Add items worth ${formatPrice(coupon.minSubtotal - subtotal)} more to use this coupon` };
  }
  return { ok: true, coupon };
};

export const cartSubtotal = (items: CartItem[]): number =>
  items.reduce((sum, i) => sum + (bookById(i.bookId)?.price ?? 0) * i.qty, 0);

export const cartCount = (items: CartItem[]): number => items.reduce((sum, i) => sum + i.qty, 0);

export interface PricingOptions {
  couponCode?: string;
  pointsToRedeem?: number;
}

export const computePricing = (items: CartItem[], opts: PricingOptions = {}): Pricing => {
  const subtotal = cartSubtotal(items);
  const tax = round2(subtotal * TAX_RATE);
  const allDigital = items.length > 0 && items.every((i) => bookById(i.bookId)?.format === 'eBook');
  const delivery = subtotal === 0 || allDigital || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;

  const couponResult = opts.couponCode ? findCoupon(opts.couponCode, subtotal) : undefined;
  const couponDiscount = couponResult?.ok ? Math.min(couponResult.coupon.discount(subtotal), subtotal) : 0;

  const payableBeforePoints = round2(subtotal + tax + delivery - couponDiscount);
  // Points are whole numbers, so the discount never exceeds the whole lei of the payable amount.
  const pointsDiscount = Math.min(Math.max(0, Math.floor(opts.pointsToRedeem ?? 0)) * POINT_VALUE, Math.floor(payableBeforePoints));

  return {
    subtotal,
    tax,
    delivery,
    couponDiscount,
    pointsDiscount,
    total: round2(payableBeforePoints - pointsDiscount),
  };
};
