-- Turnet 2.0: who opened and closed a shift, how the till was counted, why it was off,
-- and every cash movement in or out of the drawer (paying a supplier, moving takings
-- to the safe) — so "expected cash" is opening + cash sales + in − out, not a guess.
ALTER TABLE bluebar.shifts
  ADD COLUMN opened_by text,
  ADD COLUMN closed_by text,
  ADD COLUMN note text CHECK (note IS NULL OR length(note) <= 300),
  ADD COLUMN counted_detail jsonb;
CREATE TABLE bluebar.cash_movements (
  id text PRIMARY KEY,
  shift_id integer NOT NULL REFERENCES bluebar.shifts(id),
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 100000000),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 120),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_movements_shift ON bluebar.cash_movements(shift_id);
-- Shift reports can go to the cashier's network printer too.
ALTER TABLE bluebar.print_jobs DROP CONSTRAINT print_jobs_kind_check;
ALTER TABLE bluebar.print_jobs ADD CONSTRAINT print_jobs_kind_check
  CHECK (kind IN ('ticket', 'cancel', 'invoice', 'test', 'shift'));
