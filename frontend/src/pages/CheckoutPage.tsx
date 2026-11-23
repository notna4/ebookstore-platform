import { Button, NumberInput } from '@carbon/react';
import { TrashCan } from '@carbon/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AddressForm } from '../components/AddressForm';
import { BookCard } from '../components/BookCard';
import { BookSection } from '../components/BookSection';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { OrderSummary } from '../components/OrderSummary';
import { PageBreadcrumb } from '../components/PageBreadcrumb';
import { PaymentModal } from '../components/PaymentModal';
import { bookById } from '../data/books';
import { recommendFromHistory } from '../lib/catalogue';
import { cartCount, computePricing, findCoupon } from '../lib/pricing';
import { emptyAddress, validateAddress, type FieldErrors } from '../lib/validation';
import { MAX_QTY } from '../store/reducer';
import { useStore } from '../store/StoreContext';
import { useUi } from '../store/UiContext';
import type { Address, Order, PaymentMethod } from '../types';

export function CheckoutPage() {
  const { state, dispatch, commerce } = useStore();
  const { openLogin } = useUi();

  const [address, setAddress] = useState<Address>({ ...emptyAddress, email: state.user?.email ?? '' });
  const [useSaved, setUseSaved] = useState(false);
  const [savedIndex, setSavedIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors<Address>>({});

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>();
  const [couponError, setCouponError] = useState<string | undefined>();
  const [redeemPoints, setRedeemPoints] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Order | null>(null);

  const items = state.cart.flatMap((i) => {
    const book = bookById(i.bookId);
    return book ? [{ ...i, book }] : [];
  });
  const pricing = computePricing(state.cart, {
    couponCode: appliedCoupon,
    pointsToRedeem: redeemPoints ? state.giftPoints : 0,
  });
  const effectiveAddress = useSaved && state.addresses[savedIndex] ? state.addresses[savedIndex] : address;

  const applyCoupon = () => {
    const result = findCoupon(couponInput, pricing.subtotal);
    if (result.ok) {
      setAppliedCoupon(result.coupon.code);
      setCouponError(undefined);
    } else {
      setAppliedCoupon(undefined);
      setCouponError(result.error);
    }
  };

  const startPayment = () => {
    const e = validateAddress(effectiveAddress);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      document.getElementById('address-heading')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!state.user) return openLogin();
    setPayOpen(true);
  };

  const completePayment = async (method: PaymentMethod, cardNumber?: string): Promise<string | undefined> => {
    const result = await commerce.placeOrder({
      items: items.map((i) => ({ bookId: i.bookId, qty: i.qty, unitPrice: i.book.price })),
      address: effectiveAddress,
      couponCode: pricing.couponDiscount > 0 ? appliedCoupon : undefined,
      redeemPoints,
      method,
      cardNumber,
      pricing,
    });
    if ('error' in result) return result.error;
    setPayOpen(false);
    setConfirmed(result.order);
    setAppliedCoupon(undefined);
    setCouponInput('');
    setRedeemPoints(false);
    return undefined;
  };

  const closePayment = () => {
    setPayOpen(false);
    void commerce.discardPending();
  };

  const recommended = recommendFromHistory(state.user ? state.orders : [], 6)
    .filter((b) => !state.cart.some((i) => i.bookId === b.id))
    .slice(0, 3);

  return (
    <div className="page">
      <PageBreadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Checkout' }]} />
      <h1>Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Your cart is empty.</p>
          <Button as={Link} to="/">Browse books</Button>
        </div>
      ) : (
        <>
          <ul className="cart-list" aria-label="Cart items">
            {items.map(({ book, qty }) => (
              <li key={book.id}>
                <BookCard
                  book={book}
                  actions={
                    <>
                      <NumberInput
                        id={`qty-${book.id}`}
                        label={`Quantity of ${book.title}`}
                        hideLabel
                        size="sm"
                        min={1}
                        max={MAX_QTY}
                        value={qty}
                        allowEmpty={false}
                        onChange={(_, { value }) => {
                          const n = Number(value);
                          if (Number.isFinite(n)) dispatch({ type: 'cart/setQty', bookId: book.id, qty: n });
                        }}
                      />
                      <Button size="sm" kind="ghost" renderIcon={TrashCan} onClick={() => dispatch({ type: 'cart/remove', bookId: book.id })}>
                        Remove
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>

          <div className="checkout">
            <AddressForm
              value={useSaved && state.addresses[savedIndex] ? state.addresses[savedIndex] : address}
              errors={errors}
              onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))}
              saved={state.addresses}
              useSaved={useSaved}
              onUseSavedChange={setUseSaved}
              selectedSavedIndex={savedIndex}
              onSelectSaved={setSavedIndex}
            />
            <OrderSummary
              itemCount={cartCount(state.cart)}
              pricing={pricing}
              couponInput={couponInput}
              onCouponInput={setCouponInput}
              onApplyCoupon={applyCoupon}
              appliedCoupon={pricing.couponDiscount > 0 ? appliedCoupon : undefined}
              couponError={couponError}
              availablePoints={state.giftPoints}
              redeemPoints={redeemPoints}
              onRedeemPoints={setRedeemPoints}
              onPay={startPayment}
              payDisabled={items.length === 0}
            />
          </div>
        </>
      )}

      {recommended.length > 0 && <BookSection title="Recommended based on your order history" books={recommended} />}

      <PaymentModal
        open={payOpen}
        amount={pricing.total}
        walletBalance={state.walletBalance}
        onClose={closePayment}
        onPay={completePayment}
      />
      <ConfirmationModal order={confirmed} onClose={() => setConfirmed(null)} />
    </div>
  );
}
