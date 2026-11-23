import type { Book } from '../types';

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

interface Props {
  book: Book;
  authorName: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'front' | 'back';
  blurb?: string;
}

/** Generated cover artwork (deterministic colour per book). */
export function BookCover({ book, authorName, size = 'md', variant = 'front', blurb }: Props) {
  const hue = hash(book.id) % 360;
  const style = {
    '--cover-a': `hsl(${hue} 55% 38%)`,
    '--cover-b': `hsl(${(hue + 40) % 360} 60% 18%)`,
  } as React.CSSProperties;

  if (variant === 'back') {
    return (
      <div className={`book-cover book-cover--${size}`} style={style} role="img" aria-label={`Back cover of ${book.title}`}>
        <p className="book-cover__blurb">{blurb ?? book.subtitle}</p>
        <div className="book-cover__barcode" aria-hidden="true" />
        <span className="book-cover__isbn">ISBN {book.isbn}</span>
      </div>
    );
  }

  return (
    <div className={`book-cover book-cover--${size}`} style={style} role="img" aria-label={`Cover of ${book.title} by ${authorName}`}>
      <span className="book-cover__title">{book.title}</span>
      <span className="book-cover__author">{authorName}</span>
    </div>
  );
}
