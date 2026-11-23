import { InlineLoading, InlineNotification, Modal, TextInput } from '@carbon/react';
import { useEffect, useState } from 'react';
import { formatPrice } from '../lib/format';
import { isValidCardNumber, isValidCvv, isValidExpiry } from '../lib/validation';
import type { PaymentMethod } from '../types';

interface Props {
  open: boolean;
  amount: number;
  walletBalance: number;
  onClose: () => void;
  /** Resolves with an error message when the payment fails, or undefined on success. */
  onPay: (method: PaymentMethod, cardNumber?: string) => Promise<string | undefined>;
}

const tabs: { id: PaymentMethod; label: string }[] = [
  { id: 'credit-card', label: 'Credit Card' },
  { id: 'debit-card', label: 'Debit Card' },
  { id: 'cash-on-delivery', label: 'Cash on Delivery' },
  { id: 'wallet', label: 'Wallet' },
];

const formatCardNumber = (v: string): string =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1-');

const formatExpiry = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 6);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/**
 * Simulated payment gateway. Card details live only in component state
 * and are discarded when the modal closes; nothing is persisted or logged.
 */
export function PaymentModal({ open, amount, walletBalance, onClose, onPay }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('credit-card');
  const [card, setCard] = useState({ number: '', name: '', cvv: '', expiry: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) {
      setCard({ number: '', name: '', cvv: '', expiry: '' });
      setErrors({});
      setPayError(undefined);
      setProcessing(false);
      setMethod('credit-card');
    }
  }, [open]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (method === 'credit-card' || method === 'debit-card') {
      if (!isValidCardNumber(card.number)) e.number = 'Enter a valid card number';
      if (!card.name.trim()) e.name = 'Name on card is required';
      if (!isValidCvv(card.cvv)) e.cvv = 'Enter a 3 or 4 digit CVV';
      if (!isValidExpiry(card.expiry)) e.expiry = 'Enter a valid future date (MM/YYYY)';
    } else if (method === 'wallet' && walletBalance < amount) {
      e.wallet = 'Insufficient wallet balance';
    }
    return e;
  };

  const pay = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || processing) return;
    setPayError(undefined);
    setProcessing(true);
    const isCard = method === 'credit-card' || method === 'debit-card';
    const error = await onPay(method, isCard ? card.number : undefined);
    if (error) {
      setPayError(error);
      setProcessing(false);
    }
  };

  return (
    <Modal
      open={open}
      size="md"
      modalHeading="Complete Payment"
      modalLabel={`Payable Amount: ${formatPrice(amount)}`}
      primaryButtonText={processing ? 'Processing…' : method === 'cash-on-delivery' ? 'Place Order' : 'Pay Now'}
      primaryButtonDisabled={processing}
      secondaryButtonText="Cancel"
      onRequestClose={() => !processing && onClose()}
      onRequestSubmit={() => void pay()}
    >
      <div className="payment">
        <div className="payment__tabs" role="tablist" aria-orientation="vertical" aria-label="Payment method">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={method === t.id}
              className={`payment__tab${method === t.id ? ' is-active' : ''}`}
              disabled={processing}
              onClick={() => {
                setMethod(t.id);
                setErrors({});
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          className="payment__panel stack"
          role="tabpanel"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void pay();
          }}
        >
          {(method === 'credit-card' || method === 'debit-card') && (
            <>
              <TextInput id="pay-number" labelText="Card Number" placeholder="XXXX-XXXX-XXXX-XXXX" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard((c) => ({ ...c, number: formatCardNumber(e.target.value) }))} invalid={!!errors.number} invalidText={errors.number} />
              <TextInput id="pay-name" labelText="Name on Card" placeholder="Name" autoComplete="cc-name" value={card.name} onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} invalid={!!errors.name} invalidText={errors.name} />
              <div className="form-grid">
                <TextInput id="pay-cvv" type="password" labelText="CVV" placeholder="XXX" inputMode="numeric" maxLength={4} autoComplete="cc-csc" value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, '') }))} invalid={!!errors.cvv} invalidText={errors.cvv} />
                <TextInput id="pay-expiry" labelText="Date of Expiry" placeholder="MM/YYYY" inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))} invalid={!!errors.expiry} invalidText={errors.expiry} />
              </div>
            </>
          )}
          {method === 'cash-on-delivery' && (
            <p>
              Pay <strong>{formatPrice(amount)}</strong> in cash or by card to the courier when your books arrive.
            </p>
          )}
          {method === 'wallet' && (
            <div className="stack">
              <p>Book Worm Wallet balance: <strong>{formatPrice(walletBalance)}</strong></p>
              {errors.wallet && <InlineNotification hideCloseButton lowContrast kind="error" title="Cannot pay" subtitle={errors.wallet} />}
            </div>
          )}
          {payError && <InlineNotification hideCloseButton lowContrast kind="error" title="Payment failed" subtitle={payError} />}
          {processing && <InlineLoading description="Processing your payment…" />}
        </form>
      </div>
    </Modal>
  );
}
