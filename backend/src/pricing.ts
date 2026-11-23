import type { Queryable } from './db.js';

/** Romanian reduced VAT (TVA) rate for books. */
export const TAX_RATE = 0.11;
export const FREE_DELIVERY_THRESHOLD = 100;
export const DELIVERY_FEE = 15;
/** 1 gift point = 1 RON; points are whole numbers. */
export const POINT_VALUE = 1;
/** Points earned per RON spent: floor(total / 10). */
export const POINTS_EARN_DIVISOR = 10;

/** Round to 2 decimals (bani). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CartLine {
  bookId: string;
  format: string;
  price: number;
  quantity: number;
}

export interface Coupon {
  code: string;
  kind: 'flat' | 'percent';
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
}

export type CouponResult = { ok: true; coupon: Coupon } | { ok: false; error: string };

interface CouponRow {
  code: string;
  kind: 'flat' | 'percent';
  value: number;
  max_discount: number | null;
  min_subtotal: number;
}

const money = (n: number): string => `${round2(n).toFixed(2)} RON`;

export const findCoupon = async (q: Queryable, code: string, subtotal: number): Promise<CouponResult> => {
  const [row] = await q.query<CouponRow>(
    `SELECT code, kind, value::float8 AS value, max_discount::float8 AS max_discount, min_subtotal::float8 AS min_subtotal
       FROM coupons
      WHERE code = $1 AND active AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())`,
    [code.trim().toUpperCase()],
  );
  if (!row) return { ok: false, error: 'Invalid coupon code' };
  const coupon: Coupon = {
    code: row.code,
    kind: row.kind,
    value: Number(row.value),
    maxDiscount: row.max_discount === null ? null : Number(row.max_discount),
    minSubtotal: Number(row.min_subtotal),
  };
  if (subtotal < coupon.minSubtotal) {
    return { ok: false, error: `Add items worth ${money(coupon.minSubtotal - subtotal)} more to use this coupon` };
  }
  return { ok: true, coupon };
};

const couponDiscount = (coupon: Coupon, subtotal: number): number => {
  const raw = coupon.kind === 'flat' ? coupon.value : round2((subtotal * coupon.value) / 100);
  return Math.min(coupon.maxDiscount === null ? raw : Math.min(raw, coupon.maxDiscount), subtotal);
};

export interface Quote {
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  couponCode?: string;
  couponDiscount: number;
  couponError?: string;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
}

export interface QuoteInput {
  lines: CartLine[];
  coupon?: CouponResult;
  /** Gift points the user may redeem; 0 when not redeeming. */
  pointsToRedeem: number;
}

export const computeQuote = ({ lines, coupon, pointsToRedeem }: QuoteInput): Quote => {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const tax = round2(subtotal * TAX_RATE);
  const allDigital = lines.length > 0 && lines.every((l) => l.format === 'eBook');
  const deliveryCharge = subtotal === 0 || allDigital || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;

  const applied = coupon?.ok ? coupon.coupon : undefined;
  const discount = applied ? round2(couponDiscount(applied, subtotal)) : 0;

  const payableBeforePoints = round2(subtotal + tax + deliveryCharge - discount);
  // Whole points only, never more than the whole lei of the payable amount.
  const pointsUsed = Math.min(Math.max(0, Math.floor(pointsToRedeem)), Math.floor(payableBeforePoints / POINT_VALUE));
  const pointsDiscount = pointsUsed * POINT_VALUE;

  return {
    subtotal,
    tax,
    deliveryCharge,
    ...(applied ? { couponCode: applied.code } : {}),
    couponDiscount: discount,
    ...(coupon && !coupon.ok ? { couponError: coupon.error } : {}),
    pointsUsed,
    pointsDiscount,
    total: round2(payableBeforePoints - pointsDiscount),
  };
};

export const pointsEarned = (total: number): number => Math.floor(total / POINTS_EARN_DIVISOR);
