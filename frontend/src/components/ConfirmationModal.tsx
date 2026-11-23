import { Button, Modal } from '@carbon/react';
import { Book, CheckmarkFilled } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { bookById } from '../data/books';
import type { Order } from '../types';
import { formatPrice } from '../lib/format';
import { BookCard } from './BookCard';

interface Props {
  order: Order | null;
  onClose: () => void;
}

export function ConfirmationModal({ order, onClose }: Props) {
  const navigate = useNavigate();
  const done = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <Modal open={!!order} passiveModal size="md" modalHeading="Purchase complete" onRequestClose={() => done('/')}>
      {order && (
        <div className="confirmation">
          <CheckmarkFilled size={48} className="confirmation__icon" aria-hidden="true" />
          <h2>Your purchase of the following reads is successful</h2>
          <p className="muted">
            Order {order.number} · Total {formatPrice(order.pricing.total)}. You can cancel within 48 hours from My Orders.
          </p>
          <div className="confirmation__items">
            {order.items.map((i) => {
              const book = bookById(i.bookId);
              return book ? <BookCard key={i.bookId} book={book} compact qty={i.qty} /> : null;
            })}
          </div>
          <div className="confirmation__actions">
            <Button kind="tertiary" onClick={() => done('/orders')}>View My Orders</Button>
            <Button renderIcon={Book} onClick={() => done('/')}>Continue your Shopping</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
