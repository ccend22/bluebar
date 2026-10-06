-- An order line is no longer "a product at a table": the same product can sit on two
-- lines with different instructions (one cappuccino with soy milk, one without). Each
-- line gets its own key; existing lines keep one per product ('p' || product_id).
ALTER TABLE bluebar.order_lines
  ADD COLUMN line_key text,
  ADD COLUMN note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  -- An allergy is not a note: it's shown and printed apart, in red / capitals.
  ADD COLUMN allergy text NOT NULL DEFAULT '' CHECK (length(allergy) <= 200),
  -- Chosen variants/extras, each with its price: [{name, price}]. The line's price includes them.
  ADD COLUMN extras jsonb NOT NULL DEFAULT '[]',
  -- 0 = no course (drinks: sent right away), 1 antipastë, 2 kryesore, 3 ëmbëlsirë.
  ADD COLUMN course smallint NOT NULL DEFAULT 0 CHECK (course BETWEEN 0 AND 3),
  -- "Mbaje në pritje": not sent until released.
  ADD COLUMN hold boolean NOT NULL DEFAULT false;
UPDATE bluebar.order_lines SET line_key = 'p' || product_id;
ALTER TABLE bluebar.order_lines ALTER COLUMN line_key SET NOT NULL;
ALTER TABLE bluebar.order_lines DROP CONSTRAINT order_lines_pkey;
ALTER TABLE bluebar.order_lines ADD PRIMARY KEY (table_id, line_key);

ALTER TABLE bluebar.invoice_lines
  ADD COLUMN line_key text,
  ADD COLUMN extras jsonb NOT NULL DEFAULT '[]';
UPDATE bluebar.invoice_lines SET line_key = 'p' || product_id;
ALTER TABLE bluebar.invoice_lines ALTER COLUMN line_key SET NOT NULL;
ALTER TABLE bluebar.invoice_lines DROP CONSTRAINT invoice_lines_pkey;
ALTER TABLE bluebar.invoice_lines ADD PRIMARY KEY (invoice_id, line_key);

-- The order's own note and allergy, and the course the kitchen has been told to start.
ALTER TABLE bluebar.dining_tables
  ADD COLUMN note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  ADD COLUMN allergy text NOT NULL DEFAULT '' CHECK (length(allergy) <= 200),
  ADD COLUMN course smallint NOT NULL DEFAULT 1 CHECK (course BETWEEN 1 AND 3);

-- What a product can be ordered with: [{name, price}] (price added to the product's).
ALTER TABLE bluebar.products ADD COLUMN extras jsonb NOT NULL DEFAULT '[]';

-- A station ticket is a new order, a void, a correction (details changed after sending)
-- or a remake (made again: the first one was wasted). It carries the order's note/allergy.
ALTER TABLE bluebar.station_tickets
  ADD COLUMN kind text NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'void', 'correction', 'remake')),
  ADD COLUMN note text NOT NULL DEFAULT '',
  ADD COLUMN allergy text NOT NULL DEFAULT '';
UPDATE bluebar.station_tickets SET kind = 'void' WHERE void;

ALTER TABLE bluebar.order_events DROP CONSTRAINT order_events_kind_check;
ALTER TABLE bluebar.order_events ADD CONSTRAINT order_events_kind_check
  CHECK (kind IN ('add', 'remove', 'void', 'send', 'assign', 'cancel', 'pay', 'transfer', 'ready',
                  'partial', 'move', 'handover', 'discount', 'comp', 'guests', 'refund',
                  'edit', 'note', 'fire', 'remake'));
