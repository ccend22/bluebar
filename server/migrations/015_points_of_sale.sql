-- Points of sale (kasat): a business with a bar inside and one outside runs a till at
-- each, with its own shift and cash count, while products and stock stay shared.
-- A till serves the tables of its areas; areas no till claims belong to the first one,
-- so an existing business keeps working exactly as before with its single till.
CREATE TABLE bluebar.points_of_sale (
  id integer PRIMARY KEY CHECK (id > 0),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  areas text[] NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX points_of_sale_name_ci ON bluebar.points_of_sale(lower(name));
INSERT INTO bluebar.points_of_sale(id, name) VALUES (1, 'Kasa kryesore');
-- One open shift per till instead of one per business.
ALTER TABLE bluebar.shifts ADD COLUMN pos_id integer NOT NULL DEFAULT 1 REFERENCES bluebar.points_of_sale(id);
ALTER TABLE bluebar.shifts ALTER COLUMN pos_id DROP DEFAULT;
DROP INDEX bluebar.single_open_shift;
CREATE UNIQUE INDEX single_open_shift ON bluebar.shifts(pos_id) WHERE closed IS NULL;
-- A waiter working one till's area only (null: every area).
ALTER TABLE bluebar.waiters ADD COLUMN pos_id integer REFERENCES bluebar.points_of_sale(id);
-- Each till's own receipt printer (null: the business's only one).
ALTER TABLE bluebar.printers ADD COLUMN pos_id integer REFERENCES bluebar.points_of_sale(id);
