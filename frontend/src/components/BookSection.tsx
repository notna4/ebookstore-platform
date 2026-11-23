import type { Book } from '../types';
import { BookActions } from './BookActions';
import { BookCard } from './BookCard';

interface Props {
  title: string;
  books: Book[];
  emptyText?: string;
  compact?: boolean;
  headingId?: string;
}

export function BookSection({ title, books, emptyText = 'No books found.', compact = false, headingId }: Props) {
  const id = headingId ?? `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className="book-section" aria-labelledby={id}>
      <h2 id={id} className="book-section__title">{title}</h2>
      {books.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className={`book-section__grid${compact ? ' book-section__grid--stack' : ''}`}>
          {books.map((b) => (
            <BookCard key={b.id} book={b} compact={compact} actions={<BookActions book={b} />} />
          ))}
        </div>
      )}
    </section>
  );
}
