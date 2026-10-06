-- Bills: what a table owes and what it has paid so far.
-- Guests are how many people sit there now — not the table's seats (its capacity).
-- A discount is the manager's, with a reason: {kind: percent|amount, value, reason, by}.
ALTER TABLE bluebar.dining_tables
  ADD COLUMN guests smallint CHECK (guests BETWEEN 1 AND 99),
  ADD COLUMN discount jsonb;
-- Comped units (qerasje): still served and taken from stock, not charged.
ALTER TABLE bluebar.order_lines ADD COLUMN comp integer NOT NULL DEFAULT 0 CHECK (comp >= 0 AND comp <= qty);
-- Payments taken against an open bill (part of the amount, or cash then card). They
-- become the invoice's payments when the bill is settled; until then they're already
-- in the till of the shift that took them.
CREATE TABLE bluebar.order_payments (
  id text PRIMARY KEY,
  table_id integer NOT NULL REFERENCES bluebar.dining_tables(id),
  shift_id integer NOT NULL REFERENCES bluebar.shifts(id),
  method text NOT NULL CHECK (method IN ('Cash', 'Kartë')),
  amount integer NOT NULL CHECK (amount > 0),
  tip integer NOT NULL DEFAULT 0 CHECK (tip >= 0),
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Invoices: how the total came about and how it was collected. Sales are `total`; the
-- tip is the staff's, kept apart from it. A bill paid partly in cash and partly by card
-- is 'Përzier'. A fully comped bill can total 0.
ALTER TABLE bluebar.invoices DROP CONSTRAINT invoices_method_check;
ALTER TABLE bluebar.invoices ADD CONSTRAINT invoices_method_check CHECK (method IN ('Cash', 'Kartë', 'Përzier'));
ALTER TABLE bluebar.invoices DROP CONSTRAINT invoices_total_check;
ALTER TABLE bluebar.invoices ADD CONSTRAINT invoices_total_check CHECK (total >= 0);
ALTER TABLE bluebar.invoices
  ADD COLUMN subtotal bigint,
  ADD COLUMN comps bigint NOT NULL DEFAULT 0 CHECK (comps >= 0),
  ADD COLUMN discount bigint NOT NULL DEFAULT 0 CHECK (discount >= 0),
  ADD COLUMN discount_reason text,
  ADD COLUMN cash_amount bigint NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  ADD COLUMN card_amount bigint NOT NULL DEFAULT 0 CHECK (card_amount >= 0),
  ADD COLUMN tip_cash bigint NOT NULL DEFAULT 0 CHECK (tip_cash >= 0),
  ADD COLUMN tip_card bigint NOT NULL DEFAULT 0 CHECK (tip_card >= 0),
  ADD COLUMN guests smallint;
UPDATE bluebar.invoices SET subtotal = total,
  cash_amount = CASE WHEN method = 'Cash' THEN total ELSE 0 END,
  card_amount = CASE WHEN method = 'Kartë' THEN total ELSE 0 END;
ALTER TABLE bluebar.invoices ADD CONSTRAINT invoices_collected CHECK (cash_amount + card_amount = total);
ALTER TABLE bluebar.invoice_lines ADD COLUMN comp integer NOT NULL DEFAULT 0 CHECK (comp >= 0 AND comp <= qty);
-- Money given back on a paid invoice: never more than it took, always with a reason.
-- A cash refund leaves the drawer of the shift open at the time. It doesn't put stock
-- back (that's a separate, explicit correction).
CREATE TABLE bluebar.refunds (
  id text PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES bluebar.invoices(id),
  shift_id integer REFERENCES bluebar.shifts(id),
  method text NOT NULL CHECK (method IN ('Cash', 'Kartë')),
  amount integer NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 200),
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_shift ON bluebar.refunds(shift_id);
ALTER TABLE bluebar.order_events DROP CONSTRAINT order_events_kind_check;
ALTER TABLE bluebar.order_events ADD CONSTRAINT order_events_kind_check
  CHECK (kind IN ('add', 'remove', 'void', 'send', 'assign', 'cancel', 'pay', 'transfer', 'ready',
                  'partial', 'move', 'handover', 'discount', 'comp', 'guests', 'refund'));
