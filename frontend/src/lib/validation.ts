import type { Address } from '../types';

export const CANCELLATION_WINDOW_MS = 48 * 60 * 60 * 1000;

export const cancellationDeadline = (placedAt: string): number =>
  new Date(placedAt).getTime() + CANCELLATION_WINDOW_MS;

export const canCancel = (status: string, placedAt: string, now: number = Date.now()): boolean =>
  status === 'placed' && now < cancellationDeadline(placedAt);

/** Human readable time left in the 48-hour window, e.g. "47h 12m". */
export const cancellationTimeLeft = (placedAt: string, now: number = Date.now()): string => {
  const ms = Math.max(0, cancellationDeadline(placedAt) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
};

export const emptyAddress: Address = {
  firstName: '',
  lastName: '',
  address: '',
  email: '',
  city: '',
  postalCode: '',
  phoneCode: '+40',
  phone: '',
  county: '',
  country: 'Romania',
};

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (v: string): boolean => EMAIL_RE.test(v.trim());

export const validateAddress = (a: Address): FieldErrors<Address> => {
  const e: FieldErrors<Address> = {};
  if (!a.firstName.trim()) e.firstName = 'First name is required';
  if (!a.lastName.trim()) e.lastName = 'Last name is required';
  if (!a.address.trim()) e.address = 'Address is required';
  if (!isValidEmail(a.email)) e.email = 'Enter a valid e-mail';
  if (!a.city.trim()) e.city = 'City is required';
  if (!/^\d{6}$/.test(a.postalCode.trim())) e.postalCode = 'Enter a 6-digit postal code';
  if (!/^\d{9}$/.test(a.phone.trim())) e.phone = 'Enter a 9-digit phone number, without the leading 0';
  if (!a.county.trim()) e.county = 'County is required';
  if (!a.country.trim()) e.country = 'Country is required';
  return e;
};

/** Luhn checksum for card numbers. */
export const isValidCardNumber = (value: string): boolean => {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
};

export const isValidExpiry = (value: string, now: Date = new Date()): boolean => {
  const m = /^(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (month < 1 || month > 12) return false;
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
};

export const isValidCvv = (value: string): boolean => /^\d{3,4}$/.test(value);
