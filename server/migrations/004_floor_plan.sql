-- Spatial floor plan: position/size are percentages of the canvas (0-100), so the
-- layout scales responsively without storing device-specific pixel coordinates.
ALTER TABLE bluebar.dining_tables
  ADD COLUMN pos_x real NOT NULL DEFAULT 50 CHECK (pos_x BETWEEN 0 AND 100),
  ADD COLUMN pos_y real NOT NULL DEFAULT 50 CHECK (pos_y BETWEEN 0 AND 100),
  ADD COLUMN width real NOT NULL DEFAULT 12 CHECK (width BETWEEN 4 AND 60),
  ADD COLUMN height real NOT NULL DEFAULT 12 CHECK (height BETWEEN 4 AND 60),
  ADD COLUMN rotation smallint NOT NULL DEFAULT 0 CHECK (rotation BETWEEN 0 AND 359),
  ADD COLUMN seats smallint NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 12),
  ADD COLUMN occupied_since timestamptz;
ALTER TABLE bluebar.dining_tables DROP CONSTRAINT dining_tables_shape_check;
ALTER TABLE bluebar.dining_tables ADD CONSTRAINT dining_tables_shape_check
  CHECK (shape IN ('Rreth','Katror','Drejtkëndësh','Bar','Oval'));
-- Existing tables get a simple grid layout instead of all stacking at the center.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM bluebar.dining_tables
)
UPDATE bluebar.dining_tables t
SET pos_x = 12 + (numbered.n % 5) * 19,
    pos_y = 15 + (numbered.n / 5) * 22
FROM numbered
WHERE t.id = numbered.id;
