-- Book Worm e-bookstore — PostgreSQL 16+ schema
--
-- Conventions
--   * Money is NUMERIC(12,2) in RON (Romanian leu). Gift points are whole integers (1 point = 1 RON).
--   * Catalogue reference data (categories, authors, books) uses stable slugs as keys,
--     matching the ids used by the frontend (e.g. 'joy-of-minimalism').
--   * Card numbers and CVVs are NEVER stored. Payments keep only the
--     payment-gateway reference.
--   * Users are authenticated through OpenID Connect; no password is stored here.
--   * Order totals and the 48-hour cancellation window are snapshotted on the order.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
CREATE TYPE book_format      AS ENUM ('Paperback', 'Hardcover', 'eBook');
CREATE TYPE user_role        AS ENUM ('customer', 'admin');
CREATE TYPE order_status     AS ENUM ('pending_payment', 'placed', 'delivered', 'cancelled');
CREATE TYPE payment_method   AS ENUM ('credit-card', 'debit-card', 'cash-on-delivery', 'wallet');
CREATE TYPE payment_status   AS ENUM ('initiated', 'succeeded', 'failed', 'refunded');
CREATE TYPE coupon_kind      AS ENUM ('flat', 'percent');
CREATE TYPE wallet_tx_reason AS ENUM ('top_up', 'order_payment', 'order_refund');
CREATE TYPE points_tx_reason AS ENUM ('earned', 'redeemed', 'restored', 'revoked');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Member subsystem
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_issuer    text        NOT NULL,
  oidc_subject   text        NOT NULL,
  email          text        NOT NULL,
  name           text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role           user_role   NOT NULL DEFAULT 'customer',
  wallet_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
  gift_points    integer     NOT NULL DEFAULT 0 CHECK (gift_points >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oidc_issuer, oidc_subject),
  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE addresses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
  last_name  text NOT NULL CHECK (char_length(last_name)  BETWEEN 1 AND 80),
  line1      text NOT NULL CHECK (char_length(line1) BETWEEN 1 AND 200),
  email      text NOT NULL,
  city       text NOT NULL,
  postal_code text NOT NULL CHECK (postal_code ~ '^[0-9]{6}$'),
  phone_code text NOT NULL DEFAULT '+40' CHECK (phone_code ~ '^\+[0-9]{1,4}$'),
  -- National number without the leading 0, e.g. 712345678.
  phone      text NOT NULL CHECK (phone ~ '^[0-9]{9}$'),
  county     text NOT NULL,
  country    text NOT NULL DEFAULT 'Romania',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses (user_id);
-- At most one default address per user.
CREATE UNIQUE INDEX addresses_one_default_per_user ON addresses (user_id) WHERE is_default;
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog subsystem
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label      text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE authors (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text NOT NULL,
  bio        text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publishers (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE books (
  id           text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text NOT NULL,
  subtitle     text NOT NULL DEFAULT '',
  author_id    text    NOT NULL REFERENCES authors (id),
  publisher_id integer NOT NULL REFERENCES publishers (id),
  category_id  text    NOT NULL REFERENCES categories (id),
  tags         text[]  NOT NULL DEFAULT '{}',
  format       book_format NOT NULL,
  price        numeric(12,2) NOT NULL CHECK (price > 0),
  language     text    NOT NULL DEFAULT 'English',
  isbn         text    NOT NULL UNIQUE,
  published_at date    NOT NULL,
  -- Physical stock; NULL for eBooks (unlimited).
  stock        integer CHECK (stock >= 0),
  -- Denormalised aggregates, maintained by the application when reviews / orders change.
  rating       numeric(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  copies_sold  integer NOT NULL DEFAULT 0 CHECK (copies_sold >= 0),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, title || ' ' || subtitle)
  ) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((format = 'eBook') = (stock IS NULL))
);
CREATE INDEX books_category_idx   ON books (category_id);
CREATE INDEX books_author_idx     ON books (author_id);
CREATE INDEX books_price_idx      ON books (price);
CREATE INDEX books_published_idx  ON books (published_at DESC);
CREATE INDEX books_sold_idx       ON books (copies_sold DESC);
CREATE INDEX books_search_idx     ON books USING gin (search_vector);
CREATE INDEX books_tags_idx       ON books USING gin (tags);
CREATE TRIGGER books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id    text NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, user_id)
);
CREATE INDEX reviews_book_idx ON reviews (book_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Member lists: cart, wishlist, followed writers
-- ---------------------------------------------------------------------------
CREATE TABLE cart_items (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  book_id    text NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  quantity   integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE wishlist_items (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  book_id  text NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE followed_authors (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author_id   text NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
  followed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, author_id)
);

-- ---------------------------------------------------------------------------
-- Order subsystem
-- ---------------------------------------------------------------------------
CREATE TABLE coupons (
  code         text PRIMARY KEY CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{3,32}$'),
  kind         coupon_kind NOT NULL,
  value        numeric(12,2) NOT NULL CHECK (value > 0),
  -- Cap for percentage coupons.
  max_discount numeric(12,2) CHECK (max_discount > 0),
  min_subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  description  text NOT NULL DEFAULT '',
  valid_from   timestamptz NOT NULL DEFAULT now(),
  valid_until  timestamptz,
  active       boolean NOT NULL DEFAULT true,
  CHECK (kind <> 'percent' OR value <= 100),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text NOT NULL UNIQUE CHECK (order_number ~ '^BW-[0-9A-F]{10}$'),
  user_id          uuid NOT NULL REFERENCES users (id),
  status           order_status NOT NULL DEFAULT 'pending_payment',
  -- Immutable snapshot of the delivery address at purchase time.
  shipping_address jsonb NOT NULL,
  subtotal         numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  -- VAT (TVA), 11% reduced rate for books.
  tax              numeric(12,2) NOT NULL CHECK (tax >= 0),
  delivery_charge  numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  coupon_code      text REFERENCES coupons (code),
  coupon_discount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (coupon_discount >= 0),
  points_used      integer NOT NULL DEFAULT 0 CHECK (points_used >= 0),
  points_discount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (points_discount >= 0),
  total            numeric(12,2) NOT NULL CHECK (total >= 0),
  placed_at        timestamptz,
  -- Store policy: orders can be cancelled within 48 hours of being placed.
  cancellable_until timestamptz,
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (total = subtotal + tax + delivery_charge - coupon_discount - points_discount),
  CHECK (coupon_discount = 0 OR coupon_code IS NOT NULL),
  CHECK (points_discount = points_used),
  -- Only unpaid orders (pending or expired/cancelled before payment) may lack a placement time.
  CHECK (placed_at IS NOT NULL OR status IN ('pending_payment', 'cancelled')),
  CHECK (status <> 'pending_payment' OR placed_at IS NULL),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CHECK (cancellable_until IS NULL OR placed_at IS NOT NULL)
);
CREATE INDEX orders_user_idx   ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  order_id    uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  book_id     text NOT NULL REFERENCES books (id),
  -- Snapshot so history survives catalogue edits.
  book_title  text NOT NULL,
  quantity    integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price  numeric(12,2) NOT NULL CHECK (unit_price > 0),
  PRIMARY KEY (order_id, book_id)
);
-- Supports "Buy It Again" and history-based recommendations.
CREATE INDEX order_items_book_idx ON order_items (book_id);

-- ---------------------------------------------------------------------------
-- Payment subsystem
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders (id),
  method            payment_method NOT NULL,
  status            payment_status NOT NULL DEFAULT 'initiated',
  amount            numeric(12,2) NOT NULL CHECK (amount >= 0),
  -- Reference returned by the payment gateway. No card / CVV data is kept.
  gateway_reference text,
  failure_reason    text,
  refunded_amount   numeric(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_amount <= amount),
  CHECK ((status = 'refunded') = (refunded_amount > 0))
);
CREATE INDEX payments_order_idx ON payments (order_id);
-- Only one successful payment per order.
CREATE UNIQUE INDEX payments_one_success_per_order ON payments (order_id) WHERE status = 'succeeded';
CREATE UNIQUE INDEX payments_gateway_ref_key ON payments (gateway_reference) WHERE gateway_reference IS NOT NULL;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only ledgers; users.wallet_balance / gift_points are the running totals.
CREATE TABLE wallet_transactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  order_id   uuid REFERENCES orders (id),
  reason     wallet_tx_reason NOT NULL,
  -- Positive = credit, negative = debit.
  amount     numeric(12,2) NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_tx_user_idx ON wallet_transactions (user_id, created_at DESC);

CREATE TABLE gift_point_transactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  order_id   uuid REFERENCES orders (id),
  reason     points_tx_reason NOT NULL,
  points     integer NOT NULL CHECK (points <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_points_tx_user_idx ON gift_point_transactions (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Idempotency: replayed POSTs with the same Idempotency-Key return the stored response
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope        text NOT NULL,
  key          text NOT NULL CHECK (char_length(key) BETWEEN 16 AND 64),
  -- SHA-256 of the request body, so reusing a key with a different payload is rejected.
  request_hash text NOT NULL,
  status_code  integer NOT NULL,
  response     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, key)
);

COMMIT;
