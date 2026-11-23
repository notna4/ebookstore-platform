import { Search } from '@carbon/react';
import { languages } from '../data/books';
import {
  formatOptions,
  priceRanges,
  sortOptions,
  type CatalogueFilters,
} from '../lib/catalogue';
import { FilterDropdown } from './FilterDropdown';

interface Props {
  filters: CatalogueFilters;
  onChange: (patch: Partial<CatalogueFilters>) => void;
}

const languageOptions = languages.map((l) => ({ id: l, label: l }));
const priceOptions = priceRanges.map((p) => ({ id: p.id, label: p.label }));

export function FilterBar({ filters, onChange }: Props) {
  return (
    <div className="filter-bar">
      <Search
        id="catalogue-search"
        size="lg"
        labelText="Search books"
        placeholder="Search what you want to read here"
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
        onClear={() => onChange({ query: '' })}
      />
      <div className="filter-bar__filters">
        <FilterDropdown id="filter-language" label="Language" options={languageOptions} value={filters.language} onChange={(language) => onChange({ language })} />
        <FilterDropdown id="filter-format" label="Format" options={formatOptions} value={filters.format} onChange={(format) => onChange({ format })} />
        <FilterDropdown id="filter-price" label="Price Range" options={priceOptions} value={filters.priceRangeId} onChange={(priceRangeId) => onChange({ priceRangeId })} />
        <FilterDropdown id="filter-sort" label="Sort by" options={sortOptions} value={filters.sort} onChange={(sort) => onChange({ sort })} />
      </div>
    </div>
  );
}
