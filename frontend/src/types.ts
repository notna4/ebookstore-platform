export type BookFormat = 'Paperback' | 'Hardcover' | 'eBook';

export interface Category {
  id: string;
  label: string;
}

export interface Author {
  id: string;
  name: string;
  bio: string;
}

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  authorId: string;
  publisher: string;
  categoryId: string;
  tags: string[];
  format: BookFormat;
  price: number;
  language: string;
  rating: number;
  sells: number;
  publishedAt: string;
  isbn: string;
}

export interface CartItem {
  bookId: string;
  qty: number;
}

export interface Address {
  firstName: string;
  lastName: string;
  address: string;
  email: string;
  city: string;
  postalCode: string;
  phoneCode: string;
  phone: string;
  county: string;
  country: string;
}

export interface User {
  name: string;
  email: string;
}

export interface Review {
  id: string;
  bookId: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
}

export type PaymentMethod = 'credit-card' | 'debit-card' | 'cash-on-delivery' | 'wallet';
export type OrderStatus = 'placed' | 'delivered' | 'cancelled';

export interface Pricing {
  subtotal: number;
  tax: number;
  delivery: number;
  couponDiscount: number;
  pointsDiscount: number;
  total: number;
}

export interface OrderItem {
  bookId: string;
  qty: number;
  unitPrice: number;
}

export interface Order {
  /** Internal identifier (used for API calls). */
  id: string;
  /** Customer-facing order number, e.g. BW-3F9A12C0DE. */
  number: string;
  items: OrderItem[];
  pricing: Pricing;
  address: Address;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  placedAt: string;
  couponCode?: string;
  pointsUsed: number;
}
