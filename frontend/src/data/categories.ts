import type { Category } from '../types';

export const ALL_CATEGORY_ID = 'all';

export const categories: Category[] = [
  { id: ALL_CATEGORY_ID, label: 'All' },
  { id: 'romance', label: 'Romance' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'science-fiction', label: 'Science Fiction' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'historical', label: 'Historical' },
  { id: 'biography', label: 'Biography' },
  { id: 'self-help', label: 'Self-help' },
  { id: 'memoir', label: 'Memoir' },
  { id: 'travel', label: 'Travel' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'children', label: "Children's" },
  { id: 'young-adult', label: 'Young Adult' },
  { id: 'comics', label: 'Comics & Graphic Novels' },
  { id: 'poetry', label: 'Poetry' },
  { id: 'drama', label: 'Drama' },
  { id: 'science', label: 'Science' },
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'religion', label: 'Religion' },
  { id: 'language-learning', label: 'Language Learning' },
];

export const categoryLabel = (id: string): string =>
  categories.find((c) => c.id === id)?.label ?? id;
