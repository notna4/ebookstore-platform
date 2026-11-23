import { Button, Tag, TextArea, Tile } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookActions } from '../components/BookActions';
import { BookCover } from '../components/BookCover';
import { BookSection } from '../components/BookSection';
import { PageBreadcrumb } from '../components/PageBreadcrumb';
import { StarPicker, StarRating } from '../components/StarRating';
import { authorById } from '../data/authors';
import { bookById } from '../data/books';
import { categoryLabel } from '../data/categories';
import { relatedBooks } from '../lib/catalogue';
import { deliveryLabel, formatCount, formatDateTime, formatPrice } from '../lib/format';
import { useStore } from '../store/StoreContext';
import { useUi } from '../store/UiContext';

const MAX_REVIEW = 100;

function ReviewForm({ bookId }: { bookId: string }) {
  const { state, dispatch } = useStore();
  const { openLogin } = useUi();
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!state.user) return openLogin();
    if (rating === 0 || !text.trim()) return setError('Add a star rating and a short review.');
    dispatch({
      type: 'review/add',
      review: {
        id: crypto.randomUUID(),
        bookId,
        author: state.user.name,
        rating,
        text: text.trim().slice(0, MAX_REVIEW),
        createdAt: new Date().toISOString(),
      },
    });
    setText('');
    setRating(0);
    setError('');
  };

  return (
    <form className="review-form" onSubmit={submit} noValidate>
      <TextArea
        id="review-text"
        labelText="Leave your review"
        placeholder="What did you think?"
        rows={3}
        maxCount={MAX_REVIEW}
        enableCounter
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_REVIEW))}
        invalid={!!error}
        invalidText={error}
      />
      <div className="review-form__row">
        <StarPicker value={rating} onChange={setRating} />
        <Button type="submit" renderIcon={ArrowRight}>
          {state.user ? 'Submit' : 'Sign in to review'}
        </Button>
      </div>
    </form>
  );
}

export function BookPage() {
  const { id } = useParams();
  const book = id ? bookById(id) : undefined;
  const { state, loadReviews } = useStore();
  const bookId = book?.id;

  useEffect(() => {
    if (bookId) void loadReviews(bookId);
  }, [bookId, loadReviews]);

  if (!book) {
    return (
      <div className="page">
        <h1>Book not found</h1>
        <p><Link to="/">Back to the catalogue</Link></p>
      </div>
    );
  }

  const author = authorById(book.authorId);
  const authorName = author?.name ?? 'Unknown';
  const reviews = state.reviews.filter((r) => r.bookId === book.id);
  const related = relatedBooks(book);

  return (
    <div className="page">
      <PageBreadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: categoryLabel(book.categoryId), to: `/?category=${book.categoryId}` },
          { label: book.title },
        ]}
      />
      <div className="book-detail">
        <div className="book-detail__main">
          <div className="book-detail__top">
            <div className="book-detail__covers">
              <BookCover book={book} authorName={authorName} size="lg" />
              <BookCover book={book} authorName={authorName} size="lg" variant="back" blurb={`${book.subtitle} ${author?.bio.match(/^[^.]+\./)?.[0] ?? ''}`.trim()} />
            </div>
            <div className="book-detail__info">
              <h1>{book.title}</h1>
              <p>by <Link to={`/writers?author=${book.authorId}`}>{authorName}</Link></p>
              <p className="muted">Published by: {book.publisher}</p>
              <p>{book.subtitle}</p>
              <div className="book-card__tags">
                <Tag type="blue">{book.format}</Tag>
                {book.tags.map((t) => <Tag key={t} type="gray">{t}</Tag>)}
              </div>
              <p className="book-detail__price">{formatPrice(book.price)}</p>
              <p className="book-card__delivery">{deliveryLabel(book.format)}</p>
              <div className="book-detail__actions">
                <BookActions book={book} large />
              </div>
              <dl className="book-detail__meta">
                <div><dt>Language</dt><dd>{book.language}</dd></div>
                <div><dt>Rating</dt><dd><StarRating value={book.rating} /></dd></div>
                <div><dt>Sells</dt><dd>{formatCount(book.sells)} copies sold</dd></div>
              </dl>
            </div>
          </div>

          <Tile className="book-detail__writer">
            <h2>About the Writer</h2>
            <p><strong>{authorName}</strong></p>
            <p>{author?.bio}</p>
          </Tile>

          <section aria-labelledby="reviews-heading" className="book-detail__reviews">
            <h2 id="reviews-heading">Reviews &amp; Ratings</h2>
            <ReviewForm bookId={book.id} />
            <ul className="review-list">
              {reviews.length === 0 && <li className="muted">No reviews yet. Be the first to review this book.</li>}
              {reviews.map((r) => (
                <li key={r.id} className="review-list__item">
                  <div className="review-list__head">
                    <strong>{r.author}</strong>
                    <StarRating value={r.rating} size={14} />
                    <span className="muted">{formatDateTime(r.createdAt)}</span>
                  </div>
                  <p>{r.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="book-detail__side">
          <BookSection title="Related Reads" books={related} compact />
        </aside>
      </div>
    </div>
  );
}
