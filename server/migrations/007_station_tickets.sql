-- Units of each open order line already sent to its station (bar/restorant/...).
-- qty - sent = what the next "Dërgo" will send.
ALTER TABLE bluebar.order_lines ADD COLUMN sent integer NOT NULL DEFAULT 0 CHECK (sent >= 0 AND sent <= qty);
-- One row per department per "Dërgo" round: that station's own work order.
-- A ticket outlives its table's order: a customer who pays before the food is made
-- must not make the kitchen's ticket vanish. Rows are deleted once the station marks
-- them done AND the order is closed (paid or cancelled) — the invoice is the record.
CREATE TABLE bluebar.station_tickets (
  id text PRIMARY KEY,
  table_id integer NOT NULL REFERENCES bluebar.dining_tables(id),
  invoice_id integer REFERENCES bluebar.invoices(id),
  round integer NOT NULL CHECK (round > 0),
  department text NOT NULL,
  waiter_id integer REFERENCES bluebar.waiters(id),
  lines jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  cancelled_at timestamptz
);
