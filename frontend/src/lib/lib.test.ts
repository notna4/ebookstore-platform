import { describe, expect, it } from 'vitest';
import { computePricing, findCoupon } from './pricing';
import { canCancel, cancellationTimeLeft } from './validation';
import { deliveryLabel, formatPrice } from './format';

describe('computePricing', () => {
  it('prices the design example cart with 11% VAT and free delivery', () => {
    const p = computePricing([
      { bookId: 'joy-of-minimalism', qty: 1 }, // 30 RON
      { bookId: 'the-path-to-success', qty: 1 }, // 70 RON
    ]);
    expect(p.subtotal).toBe(100);
    expect(p.tax).toBe(11);
    expect(p.delivery).toBe(0);
    expect(p.total).toBe(111);
  });

  it('keeps bani precision', () => {
    const p = computePricing([{ bookId: 'the-vanishing-house', qty: 1 }]); // 20 RON eBook
    expect(p.tax).toBe(2.2);
    expect(p.total).toBe(22.2);
  });

  it('charges delivery below the free threshold, but not for eBooks', () => {
    expect(computePricing([{ bookId: 'the-art-of-learning', qty: 1 }]).delivery).toBe(15);
    expect(computePricing([{ bookId: 'the-vanishing-house', qty: 1 }]).delivery).toBe(0);
  });

  it('applies coupon and gift points without going below zero', () => {
    const items = [{ bookId: 'the-art-of-focus', qty: 2 }]; // 160 + 17.6 VAT
    const p = computePricing(items, { couponCode: 'bookworm20', pointsToRedeem: 100000 });
    expect(p.couponDiscount).toBe(20);
    expect(p.pointsDiscount).toBe(157); // whole points only
    expect(p.total).toBe(0.6);
  });

  it('ignores a coupon whose minimum is not met', () => {
    const p = computePricing([{ bookId: 'joy-of-minimalism', qty: 1 }], { couponCode: 'BOOKWORM20' });
    expect(p.couponDiscount).toBe(0);
  });
});

describe('findCoupon', () => {
  it('rejects unknown codes', () => {
    expect(findCoupon('NOPE', 1000)).toEqual({ ok: false, error: 'Invalid coupon code' });
  });
});

describe('cancellation window', () => {
  const placed = '2026-01-01T00:00:00.000Z';
  const at = (h: number) => new Date(placed).getTime() + h * 3_600_000;

  it('allows cancelling within 48 hours only for placed orders', () => {
    expect(canCancel('placed', placed, at(47.9))).toBe(true);
    expect(canCancel('placed', placed, at(48))).toBe(false);
    expect(canCancel('delivered', placed, at(1))).toBe(false);
    expect(canCancel('cancelled', placed, at(1))).toBe(false);
  });

  it('reports remaining time', () => {
    expect(cancellationTimeLeft(placed, at(1))).toBe('47h 0m');
  });
});

describe('format', () => {
  it('formats prices in RON', () => {
    expect(formatPrice(1499).replace(/\s/g, ' ')).toBe('1.499 RON');
    expect(formatPrice(3.3).replace(/\s/g, ' ')).toBe('3,30 RON');
  });

  it('labels delivery', () => {
    expect(deliveryLabel('eBook')).toBe('Instant download');
    expect(deliveryLabel('Paperback', new Date(2026, 6, 17))).toBe('Delivery by Tue, 21 Jul');
  });
});
