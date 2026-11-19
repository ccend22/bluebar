-- Shpenzimet: a receipt or invoice kept with its expense, a photo or a PDF. One per expense;
-- it goes when the expense goes.
CREATE TABLE bluebar.expense_files (
  expense_id uuid PRIMARY KEY REFERENCES bluebar.expenses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  type text NOT NULL CHECK (type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  data bytea NOT NULL,
  size integer NOT NULL CHECK (size BETWEEN 1 AND 2621440),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transaksione: an entry is spending (shpenzim) or money coming in other than a sale (hyrje).
ALTER TABLE bluebar.expenses ADD COLUMN kind text NOT NULL DEFAULT 'shpenzim' CHECK (kind IN ('shpenzim', 'hyrje'));
-- Cilësimet → Porositë: the waiters' order menu with or without product photos, for the whole venue
ALTER TABLE bluebar.control ADD COLUMN order_photos boolean NOT NULL DEFAULT true;
-- Cilësimet → Transaksione: the venue's own categories, { shpenzim: [...], hyrje: [...] }; NULL = the defaults
ALTER TABLE bluebar.control ADD COLUMN transaction_categories jsonb;
