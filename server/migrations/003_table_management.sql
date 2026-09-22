-- Tables become manager-editable (area, optional shape) instead of fixed by the seed migration.
-- Soft-remove via `active`, not DELETE: dining_tables is referenced by invoices/order_lines history,
-- so a hard delete would fail once a table has any sales.
ALTER TABLE bluebar.dining_tables
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN shape text CHECK (shape IN ('Rreth','Katror','Drejtkëndësh','Bar'));
