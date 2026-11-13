-- Rezervimet: who is coming, how many, to which table, when. A venue may set its own time
-- slots ("19:00–21:00"); without them a reservation has only a start time (end_time null).
CREATE TABLE bluebar.reservations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  guests integer NOT NULL CHECK (guests BETWEEN 1 AND 500),
  table_id integer,
  day date NOT NULL,
  start_time text NOT NULL,
  end_time text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservations_day ON bluebar.reservations(day);
ALTER TABLE bluebar.control ADD COLUMN reservation_slots jsonb NOT NULL DEFAULT '[]';
