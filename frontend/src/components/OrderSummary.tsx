import { Button, Tag, TextInput, Toggle } from '@carbon/react';
import { CheckmarkFilled, Wallet } from '@carbon/icons-react';
import { formatPrice } from '../lib/format';
import { POINT_VALUE, TAX_RATE } from '../lib/pricing';
import type { Pricing } from '../types';

interface Props {
  itemCount: number;
  pricing: Pricing;
  couponInput: string;
  onCouponInput: (v: string) => void;
  onApplyCoupon: () => void;
  appliedCoupon?: string;
  couponError?: string;
  availablePoints: number;
  redeemPoints: boolean;
  onRedeemPoints: (v: boolean) => void;
  onPay: () => void;
  payDisabled: boolean;
}

export function OrderSummary({
  itemCount, pricing, couponInput, onCouponInput, onApplyCoupon, appliedCoupon, couponError,
  availablePoints, redeemPoints, onRedeemPoints, onPay, payDisabled,
}: Props) {
  return (
    <section className="checkout__summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Grand Total</h2>
      <dl className="summary-list">
        <div><dt>Price ({itemCount} item{itemCount === 1 ? '' : 's'})</dt><dd>{formatPrice(pricing.subtotal)}</dd></div>
        <div><dt>VAT ({Math.round(TAX_RATE * 100)}%)</dt><dd>{formatPrice(pricing.tax)}</dd></div>
        <div><dt>Delivery Charges</dt><dd>{pricing.delivery === 0 ? 'Free' : formatPrice(pricing.delivery)}</dd></div>
      </dl>

      <div className="coupon-row">
        <TextInput
          id="coupon"
          labelText="Apply Coupon"
          placeholder="Enter coupon code"
          value={couponInput}
          onChange={(e) => onCouponInput(e.target.value)}
          invalid={!!couponError}
          invalidText={couponError}
        />
        <Button kind="secondary" size="md" onClick={onApplyCoupon} disabled={!couponInput.trim()}>Apply</Button>
      </div>
      {appliedCoupon && (
        <Tag type="green" renderIcon={CheckmarkFilled}>{appliedCoupon} applied</Tag>
      )}

      <Toggle
        id="redeem-points"
        size="sm"
        labelText="Redeem Gift Points"
        labelA="Off"
        labelB={`${availablePoints} pts = ${formatPrice(availablePoints * POINT_VALUE)}`}
        toggled={redeemPoints}
        disabled={availablePoints === 0}
        onToggle={onRedeemPoints}
      />

      <dl className="summary-list">
        {(pricing.couponDiscount > 0 || pricing.pointsDiscount > 0) && (
          <div className="summary-list__discount">
            <dt>Discount</dt>
            <dd>-{formatPrice(pricing.couponDiscount + pricing.pointsDiscount)}</dd>
          </div>
        )}
        <div className="summary-list__total"><dt>Total Amount</dt><dd>{formatPrice(pricing.total)}</dd></div>
      </dl>

      <Button className="full-width" size="lg" renderIcon={Wallet} onClick={onPay} disabled={payDisabled}>
        Pay Now
      </Button>
    </section>
  );
}
