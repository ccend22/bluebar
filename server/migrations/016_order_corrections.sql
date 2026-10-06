-- A void ticket tells a station to stop making units it already received: the manager
-- removed a sent item, so the kitchen gets "ANULIM · 1 x Picë" instead of nothing.
ALTER TABLE bluebar.station_tickets ADD COLUMN void boolean NOT NULL DEFAULT false;
-- Every change to an open order — who added, removed, sent, moved, cancelled or paid
-- what, and when — so a correction can always be traced back.
CREATE TABLE bluebar.order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Cascade: only a never-invoiced table can be deleted, and its stray events go with it.
  table_id integer NOT NULL REFERENCES bluebar.dining_tables(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('add', 'remove', 'void', 'send', 'assign', 'cancel', 'pay')),
  -- Set on the 'pay' event: an invoice's history is its table's events since the order before.
  invoice_id integer REFERENCES bluebar.invoices(id),
  detail text NOT NULL CHECK (length(detail) <= 300),
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_table ON bluebar.order_events(table_id, created_at);
