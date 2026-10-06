-- Stations: the physical places that prepare food and drinks (the bar inside, the bar
-- outside, the pizza oven, the shared kitchen) — separate from the department a product
-- belongs to ("Bar", "Restorant") and from the till that takes the payment.
-- A station prepares some departments, for some zones (none = every zone); a ticket goes
-- to the most specific active one, else its backup. Optional: with no stations, tickets
-- route by department exactly as before.
CREATE TABLE bluebar.stations (
  id integer PRIMARY KEY CHECK (id > 0),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  departments text[] NOT NULL DEFAULT '{}',
  areas text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  backup_id integer REFERENCES bluebar.stations(id),
  -- The printer that receives its tickets; without one, a screen at Repartet shows them.
  printer_id integer REFERENCES bluebar.printers(id) ON DELETE SET NULL,
  -- Last time a Repartet screen showing this station checked in.
  device_seen_at timestamptz
);
CREATE UNIQUE INDEX stations_name_ci ON bluebar.stations(lower(name));
-- A ticket keeps where it was sent and which till it belongs to, as of sending: later
-- changes to zones, tills or stations never move tickets already out.
ALTER TABLE bluebar.station_tickets
  ADD COLUMN station_id integer REFERENCES bluebar.stations(id),
  ADD COLUMN pos_id integer REFERENCES bluebar.points_of_sale(id),
  -- A transfer waits until the receiving station accepts it.
  ADD COLUMN transfer_to integer REFERENCES bluebar.stations(id),
  ADD COLUMN transfer_by text,
  ADD COLUMN transfer_at timestamptz;
-- Existing open tickets: their till as of now.
UPDATE bluebar.station_tickets k SET pos_id = (
  SELECT p.id FROM bluebar.dining_tables t, bluebar.points_of_sale p
  WHERE t.id = k.table_id ORDER BY (t.area = ANY(p.areas)) DESC, p.id LIMIT 1
);
-- The old station's slip when a ticket moves: "TRANSFERUAR · mos e përgatitni".
ALTER TABLE bluebar.print_jobs DROP CONSTRAINT print_jobs_kind_check;
ALTER TABLE bluebar.print_jobs ADD CONSTRAINT print_jobs_kind_check
  CHECK (kind IN ('ticket', 'cancel', 'invoice', 'test', 'shift', 'moved'));
ALTER TABLE bluebar.order_events DROP CONSTRAINT order_events_kind_check;
ALTER TABLE bluebar.order_events ADD CONSTRAINT order_events_kind_check
  CHECK (kind IN ('add', 'remove', 'void', 'send', 'assign', 'cancel', 'pay', 'transfer'));
