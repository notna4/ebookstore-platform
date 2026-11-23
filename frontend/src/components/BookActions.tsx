import { Button, IconButton } from '@carbon/react';
import { Bookmark, BookmarkFilled, ShoppingCart } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import type { Book } from '../types';

interface Props {
  book: Book;
  /** Show text labels on both buttons (detail page) instead of icon-only wishlist. */
  large?: boolean;
}

export function BookActions({ book, large = false }: Props) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const inCart = state.cart.some((i) => i.bookId === book.id);
  const wished = state.wishlist.includes(book.id);
  const size = large ? 'lg' : 'sm';

  return (
    <>
      {inCart ? (
        <Button size={size} kind="tertiary" renderIcon={ShoppingCart} onClick={() => navigate('/checkout')}>
          Go to Cart
        </Button>
      ) : (
        <Button
          size={size}
          renderIcon={ShoppingCart}
          onClick={() => dispatch({ type: 'cart/add', bookId: book.id, qty: 1 })}
        >
          Add to Cart
        </Button>
      )}
      {large ? (
        <Button
          size={size}
          kind="secondary"
          renderIcon={wished ? BookmarkFilled : Bookmark}
          onClick={() => dispatch({ type: 'wishlist/toggle', bookId: book.id })}
        >
          {wished ? 'In Wishlist' : 'Add to Wishlist'}
        </Button>
      ) : (
        <IconButton
          size={size}
          kind="ghost"
          label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={wished}
          onClick={() => dispatch({ type: 'wishlist/toggle', bookId: book.id })}
        >
          {wished ? <BookmarkFilled /> : <Bookmark />}
        </IconButton>
      )}
    </>
  );
}
