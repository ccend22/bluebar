-- A venue with several rooms (Salla 1, Salla 2, Tarraca): each zone may be laid out as a room
-- of its own, the manager's choice. Off: one room holds every zone, as before.
ALTER TABLE bluebar.control ADD COLUMN separate_rooms boolean NOT NULL DEFAULT false;

-- Financat: what the venue spends, entered by the manager. Approved spending counts in the
-- period's profit; pending ("pritje") is shown apart until it is approved.
CREATE TABLE bluebar.expenses (
  id uuid PRIMARY KEY,
  spent_at timestamptz NOT NULL,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 100000000),
  category text NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 40),
  method text NOT NULL CHECK (method IN ('Cash', 'Bankë')),
  status text NOT NULL DEFAULT 'aprovuar' CHECK (status IN ('aprovuar', 'pritje')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_spent_at ON bluebar.expenses(spent_at);
