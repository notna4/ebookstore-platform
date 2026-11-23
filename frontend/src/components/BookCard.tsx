import { Tag } from '@carbon/react';
import { Link } from 'react-router-dom';
import { authorById } from '../data/authors';
import { deliveryLabel, formatPrice } from '../lib/format';
import type { Book } from '../types';
import { BookCover } from './BookCover';

interface Props {
  book: Book;
  /** Optional action area (buttons) rendered under the details. */
  actions?: React.ReactNode;
  /** Smaller cover and no subtitle (used in side lists). */
  compact?: boolean;
  /** Quantity shown next to price (cart / orders). */
  qty?: number;
}

export function BookCard({ book, actions, compact = false, qty }: Props) {
  const author = authorById(book.authorId);
  const authorName = author?.name ?? 'Unknown';

  return (
    <article className={`book-card${compact ? ' book-card--compact' : ''}`}>
      <Link to={`/book/${book.id}`} className="book-card__cover" aria-label={`View ${book.title}`} tabIndex={-1}>
        <BookCover book={book} authorName={authorName} size={compact ? 'sm' : 'md'} />
      </Link>
      <div className="book-card__body">
        <h3 className="book-card__title">
          <Link to={`/book/${book.id}`}>{book.title}</Link>
        </h3>
        <p className="book-card__author">
          by <Link to={`/writers?author=${book.authorId}`}>{authorName}</Link>
        </p>
        {!compact && <p className="book-card__subtitle">{book.subtitle}</p>}
        <div className="book-card__tags">
          <Tag type="blue" size="sm">{book.format}</Tag>
          {book.tags.map((t) => (
            <Tag key={t} type="gray" size="sm">{t}</Tag>
          ))}
        </div>
        <p className="book-card__price">
          {formatPrice(book.price)}
          {qty !== undefined && <span className="book-card__qty"> × {qty}</span>}
        </p>
        <p className="book-card__delivery">{deliveryLabel(book.format)}</p>
        {actions && <div className="book-card__actions">{actions}</div>}
      </div>
    </article>
  );
}
