import { Button } from '@carbon/react';
import { Link } from 'react-router-dom';
import { BookActions } from '../components/BookActions';
import { BookCard } from '../components/BookCard';
import { PageBreadcrumb } from '../components/PageBreadcrumb';
import { bookById } from '../data/books';
import { useStore } from '../store/StoreContext';

export function WishlistPage() {
  const { state } = useStore();
  const wished = state.wishlist.flatMap((id) => {
    const b = bookById(id);
    return b ? [b] : [];
  });

  return (
    <div className="page">
      <PageBreadcrumb items={[{ label: 'Home', to: '/' }, { label: 'My Wishlist' }]} />
      <h1>My Wishlist</h1>
      {wished.length === 0 ? (
        <div className="empty-state">
          <p>Your wishlist is empty. Use the bookmark icon on any book to save it for later.</p>
          <Button as={Link} to="/">Browse books</Button>
        </div>
      ) : (
        <div className="book-section__grid">
          {wished.map((b) => (
            <BookCard key={b.id} book={b} actions={<BookActions book={b} />} />
          ))}
        </div>
      )}
    </div>
  );
}
