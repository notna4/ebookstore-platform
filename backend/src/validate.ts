import { z } from 'zod';
import { badRequest, zodFieldErrors } from './errors.js';

/** Parses untrusted input; throws a 400 problem with per-field errors on failure. */
export const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest('The request is invalid.', zodFieldErrors(result.error));
  return result.data;
};

export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Invalid identifier').max(100);
export const uuid = z.uuid();

/** Query-string integer with default and bounds. */
const intParam = (def: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(def);

export const pageQuery = z.object({ page: intParam(1, 1, 100_000), pageSize: intParam(12, 1, 50) });
export const limitQuery = z.object({ limit: intParam(3, 1, 24) });

const couponCode = z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Invalid coupon code');

export const bookSearchQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: slug.optional(),
  author: slug.optional(),
  language: z.string().trim().max(40).optional(),
  format: z.enum(['Paperback', 'Hardcover', 'eBook']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'newest']).default('relevance'),
});

export const reviewInput = z.strictObject({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1).max(100),
});

export const addressInput = z.strictObject({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  line1: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  city: z.string().trim().min(1).max(80),
  postalCode: z.string().regex(/^[0-9]{6}$/, 'Enter a 6-digit postal code'),
  phoneCode: z.string().regex(/^\+[0-9]{1,4}$/).default('+40'),
  phone: z.string().regex(/^[0-9]{9}$/, 'Enter a 9-digit phone number without the leading 0'),
  county: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80).default('Romania'),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.output<typeof addressInput>;

export const cartItemInput = z.strictObject({ quantity: z.number().int().min(1).max(10) });

export const quoteRequest = z.strictObject({
  couponCode: couponCode.optional(),
  redeemGiftPoints: z.boolean().default(false),
});

export const createOrderRequest = z.strictObject({
  shippingAddress: z.union([
    z.strictObject({ addressId: uuid }),
    z.strictObject({ address: addressInput, save: z.boolean().default(false) }),
  ]),
  couponCode: couponCode.optional(),
  redeemGiftPoints: z.boolean().default(false),
});

export const paymentRequest = z.discriminatedUnion('method', [
  z.strictObject({ method: z.enum(['wallet', 'cash-on-delivery']) }),
  z.strictObject({ method: z.enum(['credit-card', 'debit-card']), paymentToken: z.string().min(8).max(512) }),
]);

export const idempotencyKey = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
