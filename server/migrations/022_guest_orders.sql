-- Orders guests place from the online menu (scanning their table's QR code). They wait
-- for a waiter: accepted, the items join the table's order and go to the stations as if
-- the waiter had entered them; rejected, nothing reaches the table. Prices are never
-- taken from the guest: they are the product's own when the order is accepted.
CREATE TABLE bluebar.guest_orders (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_id integer NOT NULL REFERENCES bluebar.dining_tables(id),
  -- [{productId, qty, extras: [name], note}]
  items jsonb NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  decided_by text,
  -- The guest's phone polls its order's status with this (only its hash is kept).
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  -- Sent straight to the stations, the order still tells the waiter: until someone
  -- taps "E pashë" it stays on their screen.
  seen_at timestamptz
);
CREATE INDEX guest_orders_pending ON bluebar.guest_orders(table_id) WHERE status = 'pending';
ALTER TABLE bluebar.order_events DROP CONSTRAINT order_events_kind_check;
ALTER TABLE bluebar.order_events ADD CONSTRAINT order_events_kind_check
  CHECK (kind IN ('add', 'remove', 'void', 'send', 'assign', 'cancel', 'pay', 'transfer', 'ready',
                  'partial', 'move', 'handover', 'discount', 'comp', 'guests', 'refund',
                  'edit', 'note', 'fire', 'remake', 'guest'));
