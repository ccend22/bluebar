CREATE SCHEMA IF NOT EXISTS bluebar;
CREATE TABLE bluebar.control (
  id integer PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0)
);
INSERT INTO bluebar.control(id) VALUES (1);
CREATE TABLE bluebar.categories (name text PRIMARY KEY CHECK(length(trim(name)) BETWEEN 1 AND 40));
CREATE UNIQUE INDEX categories_name_ci ON bluebar.categories(lower(name));
CREATE TABLE bluebar.products (
  id integer PRIMARY KEY CHECK(id > 0), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  category text NOT NULL REFERENCES bluebar.categories(name),
  price integer NOT NULL CHECK(price BETWEEN 1 AND 1000000), stock integer NOT NULL DEFAULT 0 CHECK(stock >= 0)
);
CREATE UNIQUE INDEX products_name_ci ON bluebar.products(lower(name));
CREATE TABLE bluebar.waiters (
  id integer PRIMARY KEY CHECK(id > 0), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80), active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX waiters_name_ci ON bluebar.waiters(lower(name));
CREATE TABLE bluebar.dining_tables (
  id integer PRIMARY KEY CHECK(id > 0), area text NOT NULL CHECK(length(trim(area)) BETWEEN 1 AND 40),
  waiter_id integer REFERENCES bluebar.waiters(id)
);
CREATE TABLE bluebar.order_lines (
  table_id integer NOT NULL REFERENCES bluebar.dining_tables(id), product_id integer NOT NULL REFERENCES bluebar.products(id),
  name text NOT NULL, price integer NOT NULL CHECK(price > 0), qty integer NOT NULL CHECK(qty > 0),
  PRIMARY KEY(table_id, product_id)
);
CREATE TABLE bluebar.shifts (
  id integer PRIMARY KEY CHECK(id > 0), opened timestamptz NOT NULL, opening integer NOT NULL CHECK(opening BETWEEN 0 AND 100000000),
  closed timestamptz, counted integer CHECK(counted BETWEEN 0 AND 100000000), expected bigint CHECK(expected >= 0), difference bigint,
  CHECK((closed IS NULL AND counted IS NULL AND expected IS NULL AND difference IS NULL) OR
        (closed IS NOT NULL AND counted IS NOT NULL AND expected IS NOT NULL AND difference IS NOT NULL AND difference = counted-expected))
);
CREATE UNIQUE INDEX single_open_shift ON bluebar.shifts((true)) WHERE closed IS NULL;
CREATE TABLE bluebar.invoices (
  id integer PRIMARY KEY CHECK(id > 0), table_id integer NOT NULL REFERENCES bluebar.dining_tables(id),
  waiter_id integer NOT NULL REFERENCES bluebar.waiters(id), shift_id integer NOT NULL REFERENCES bluebar.shifts(id),
  total bigint NOT NULL CHECK(total > 0), method text NOT NULL CHECK(method IN ('Cash','Kartë')), created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Paguar' CHECK(status='Paguar')
);
CREATE INDEX invoices_shift ON bluebar.invoices(shift_id);
CREATE TABLE bluebar.invoice_lines (
  invoice_id integer NOT NULL REFERENCES bluebar.invoices(id), product_id integer NOT NULL REFERENCES bluebar.products(id),
  name text NOT NULL, price integer NOT NULL CHECK(price > 0), qty integer NOT NULL CHECK(qty > 0),
  PRIMARY KEY(invoice_id,product_id)
);
CREATE TABLE bluebar.stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product text NOT NULL, qty integer NOT NULL CHECK(qty <> 0),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bluebar.commands (
  id uuid PRIMARY KEY, payload_hash text NOT NULL, type text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Configuration only: no sample staff, products, payments, opening cash or sales.
INSERT INTO bluebar.categories(name) VALUES ('Kafe'),('Pije'),('Birra'),('Ushqim');
INSERT INTO bluebar.dining_tables(id,area) SELECT n, CASE WHEN n <= 8 THEN 'Salla' ELSE 'Tarraca' END FROM generate_series(1,12) n;
