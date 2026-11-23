import { Button, InlineNotification, Modal, Tag } from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookCard } from '../components/BookCard';
import { PageBreadcrumb } from '../components/PageBreadcrumb';
import { bookById } from '../data/books';
import { formatDateTime, formatPrice } from '../lib/format';
import { cancellationTimeLeft, canCancel } from '../lib/validation';
import { useStore } from '../store/StoreContext';
import { useUi } from '../store/UiContext';
import type { OrderStatus } from '../types';

const statusTag: Record<OrderStatus, { type: 'blue' | 'green' | 'red'; label: string }> = {
  placed: { type: 'blue', label: 'Order placed' },
  delivered: { type: 'green', label: 'Delivered' },
  cancelled: { type: 'red', label: 'Cancelled' },
};

export function OrdersPage() {
  const { state, dispatch, commerce } = useStore();
  const { openLogin } = useUi();
  const navigate = useNavigate();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | undefined>();

  const buyAgain = (bookId: string, qty: number) => {
    dispatch({ type: 'cart/add', bookId, qty });
    navigate('/checkout');
  };

  if (!state.user) {
    return (
      <div className="page">
        <PageBreadcrumb items={[{ label: 'Home', to: '/' }, { label: 'My Orders' }]} />
        <h1>My Orders</h1>
        <div className="empty-state">
          <p>Sign in to see your order history.</p>
          <Button onClick={openLogin}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageBreadcrumb items={[{ label: 'Home', to: '/' }, { label: 'My Orders' }]} />
      <h1>My Orders</h1>
      {cancelError && (
        <InlineNotification lowContrast kind="error" title="Could not cancel the order" subtitle={cancelError} onCloseButtonClick={() => setCancelError(undefined)} />
      )}
      {state.orders.length === 0 ? (
        <div className="empty-state">
          <p>You have not placed any orders yet.</p>
          <Button as={Link} to="/">Browse books</Button>
        </div>
      ) : (
        <ul className="order-list">
          {state.orders.map((order) => {
            const tag = statusTag[order.status];
            const cancellable = canCancel(order.status, order.placedAt);
            return (
              <li key={order.id} className="order">
                <header className="order__head">
                  <div>
                    <h2 className="order__id">Order {order.number}</h2>
                    <p className="muted">Placed {formatDateTime(order.placedAt)} · Total {formatPrice(order.pricing.total)}</p>
                  </div>
                  <div className="order__status">
                    <Tag type={tag.type}>{tag.label}</Tag>
                    {cancellable && (
                      <>
                        <span className="muted">Free cancellation: {cancellationTimeLeft(order.placedAt)} left</span>
                        <Button size="sm" kind="danger--tertiary" onClick={() => setCancelId(order.id)}>
                          Cancel order
                        </Button>
                      </>
                    )}
                  </div>
                </header>
                <div className="order__items">
                  {order.items.map((i) => {
                    const book = bookById(i.bookId);
                    if (!book) return null;
                    return (
                      <BookCard
                        key={i.bookId}
                        book={book}
                        compact
                        qty={i.qty}
                        actions={
                          <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={() => buyAgain(i.bookId, 1)}>
                            Buy It Again
                          </Button>
                        }
                      />
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={cancelId !== null}
        danger
        size="xs"
        modalHeading="Cancel this order?"
        primaryButtonText="Cancel order"
        secondaryButtonText="Keep order"
        onRequestClose={() => setCancelId(null)}
        onRequestSubmit={() => {
          const id = cancelId;
          setCancelId(null);
          if (id) void commerce.cancelOrder(id).then(setCancelError);
        }}
      >
        <p>The amount paid will be refunded to your Book Worm Wallet and any redeemed gift points restored.</p>
      </Modal>
    </div>
  );
}
