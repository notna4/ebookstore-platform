import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookSection } from '../components/BookSection';
import { CategorySidebar } from '../components/CategorySidebar';
import { FilterBar } from '../components/FilterBar';
import { ALL_CATEGORY_ID, categories, categoryLabel } from '../data/categories';
import { books } from '../data/books';
import {
  bestsellers,
  defaultFilters,
  filterBooks,
  newLaunches,
  recommendFromHistory,
  type CatalogueFilters,
} from '../lib/catalogue';
import { useStore } from '../store/StoreContext';

export function HomePage() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<CatalogueFilters>(defaultFilters);

  const requestedCategory = params.get('category') ?? ALL_CATEGORY_ID;
  const categoryId = categories.some((c) => c.id === requestedCategory) ? requestedCategory : ALL_CATEGORY_ID;
  const active: CatalogueFilters = { ...filters, categoryId };

  const isDefaultView =
    categoryId === ALL_CATEGORY_ID &&
    !filters.query.trim() &&
    filters.language === 'All' &&
    filters.format === 'All' &&
    filters.priceRangeId === 'all' &&
    filters.sort === 'relevance';

  const results = filterBooks(books, active);
  const recommended = recommendFromHistory(state.user ? state.orders : []);

  const selectCategory = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === ALL_CATEGORY_ID) next.delete('category');
    else next.set('category', id);
    setParams(next);
  };

  return (
    <div className="page page--with-sidebar">
      <CategorySidebar selectedId={categoryId} onSelect={selectCategory} />
      <div className="page__main">
        <FilterBar filters={active} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} />
        {isDefaultView ? (
          <>
            <BookSection title="Recommended for You" books={recommended} />
            <BookSection title="Bestsellers this Month" books={bestsellers(books)} />
            <BookSection title="New Launches" books={newLaunches(books)} />
          </>
        ) : (
          <BookSection
            title={`${categoryLabel(categoryId)} books (${results.length})`}
            headingId="results-heading"
            books={results}
            emptyText="No books match your search. Try changing the filters."
          />
        )}
      </div>
    </div>
  );
}
