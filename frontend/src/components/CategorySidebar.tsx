import { categories } from '../data/categories';

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function CategorySidebar({ selectedId, onSelect }: Props) {
  return (
    <nav className="category-sidebar" aria-label="Book categories">
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`category-sidebar__item${c.id === selectedId ? ' is-active' : ''}`}
              aria-current={c.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(c.id)}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
