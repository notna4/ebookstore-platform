import { Star, StarFilled, StarHalf } from '@carbon/icons-react';

interface DisplayProps {
  value: number;
  size?: number;
}

/** Read-only star display (supports half stars). */
export function StarRating({ value, size = 16 }: DisplayProps) {
  return (
    <span className="star-rating" role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        if (value >= n - 0.25) return <StarFilled key={n} size={size} />;
        if (value >= n - 0.75) return <StarHalf key={n} size={size} />;
        return <Star key={n} size={size} />;
      })}
    </span>
  );
}

interface PickerProps {
  value: number;
  onChange: (value: number) => void;
}

/** Interactive 1-5 star picker. */
export function StarPicker({ value, onChange }: PickerProps) {
  return (
    <div className="star-rating star-rating--picker" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="star-rating__btn"
          onClick={() => onChange(n)}
        >
          {n <= value ? <StarFilled size={24} /> : <Star size={24} />}
        </button>
      ))}
    </div>
  );
}
