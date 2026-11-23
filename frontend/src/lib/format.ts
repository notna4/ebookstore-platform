import type { BookFormat } from '../types';

export const CURRENCY = 'RON';

const moneyOptions = { style: 'currency', currency: CURRENCY } as const;
const wholeMoney = new Intl.NumberFormat('ro-RO', { ...moneyOptions, maximumFractionDigits: 0 });
const fractionalMoney = new Intl.NumberFormat('ro-RO', { ...moneyOptions, minimumFractionDigits: 2 });

/** "30 RON" for whole amounts, "3,30 RON" when there are bani. */
export const formatPrice = (amount: number): string =>
  (Number.isInteger(amount) ? wholeMoney : fractionalMoney).format(amount);

const DELIVERY_DAYS: Record<BookFormat, number> = {
  Paperback: 4,
  Hardcover: 6,
  eBook: 0,
};

/** Tentative delivery date label, e.g. "Delivery by Mon, 21 Jul". */
export const deliveryLabel = (format: BookFormat, from: Date = new Date()): string => {
  if (format === 'eBook') return 'Instant download';
  const d = new Date(from);
  d.setDate(d.getDate() + DELIVERY_DAYS[format]);
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `Delivery by ${get('weekday')}, ${get('day')} ${get('month')}`;
};

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const formatCount = (n: number): string => n.toLocaleString('ro-RO');
