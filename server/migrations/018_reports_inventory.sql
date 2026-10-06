-- Reports: what a correction was worth and which till it happened at, and how long a
-- station took ('ready': the station marked a ticket done), kept in the event history
-- because station tickets themselves are pruned.
ALTER TABLE bluebar.order_events
  ADD COLUMN amount integer,
  ADD COLUMN pos_id integer REFERENCES bluebar.points_of_sale(id),
  ADD COLUMN duration_s integer CHECK (duration_s IS NULL OR duration_s >= 0);
ALTER TABLE bluebar.order_events DROP CONSTRAINT order_events_kind_check;
ALTER TABLE bluebar.order_events ADD CONSTRAINT order_events_kind_check
  CHECK (kind IN ('add', 'remove', 'void', 'send', 'assign', 'cancel', 'pay', 'transfer', 'ready'));
CREATE INDEX order_events_kind_time ON bluebar.order_events(kind, created_at);
-- Inventory, step 1: a per-product low-stock threshold (10 was the fixed one), a product
-- that's temporarily off the menu without being deleted, and who moved stock and why.
ALTER TABLE bluebar.products
  ADD COLUMN min_stock integer NOT NULL DEFAULT 10 CHECK (min_stock BETWEEN 0 AND 100000),
  ADD COLUMN available boolean NOT NULL DEFAULT true;
ALTER TABLE bluebar.stock_movements
  ADD COLUMN kind text NOT NULL DEFAULT 'adjust' CHECK (kind IN ('sale', 'receive', 'adjust', 'loss')),
  ADD COLUMN actor text;
UPDATE bluebar.stock_movements SET kind = CASE
  WHEN reason LIKE 'Fatura %' THEN 'sale' WHEN reason = 'Hyrje manuale' THEN 'receive' ELSE 'adjust' END;
CREATE INDEX invoices_created ON bluebar.invoices(created_at);
