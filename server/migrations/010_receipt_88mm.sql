-- Allow 56 normal-font columns for 88 mm thermal paper. Keep narrower station
-- printers unchanged; move existing 80 mm cashier printers to the requested size.
ALTER TABLE bluebar.printers DROP CONSTRAINT IF EXISTS printers_width_check;
ALTER TABLE bluebar.printers ADD CONSTRAINT printers_width_check
  CHECK (width IN (32, 42, 48, 56));
ALTER TABLE bluebar.printers ALTER COLUMN width SET DEFAULT 56;
UPDATE bluebar.printers SET width = 56 WHERE receipts AND width IN (42, 48);
