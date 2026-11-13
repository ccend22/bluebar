-- Llogaritë financiare: where the venue's money sits. An account may take in one payment method
-- by itself (cash sales and cash spending land in the till's account, card and bank in the
-- bank's); money also moves between accounts, or into and out of one, by hand.
CREATE TABLE bluebar.money_accounts (
  id serial PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  grp text NOT NULL DEFAULT 'own' CHECK (grp IN ('own', 'partner')),
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('cash', 'bank', 'card', 'other')),
  opening integer NOT NULL DEFAULT 0 CHECK (opening BETWEEN -100000000 AND 100000000),
  receives text UNIQUE CHECK (receives IN ('Cash', 'Bankë')),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bluebar.money_accounts(name, grp, kind, receives) VALUES ('Arka', 'own', 'cash', 'Cash'), ('Banka', 'own', 'bank', 'Bankë');
CREATE TABLE bluebar.money_moves (
  id uuid PRIMARY KEY,
  from_account integer REFERENCES bluebar.money_accounts(id) ON DELETE CASCADE,
  to_account integer REFERENCES bluebar.money_accounts(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 100000000),
  moved_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_by text,
  CHECK (from_account IS NOT NULL OR to_account IS NOT NULL),
  CHECK (from_account IS DISTINCT FROM to_account)
);
