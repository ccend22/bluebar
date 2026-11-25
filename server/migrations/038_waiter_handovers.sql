-- Arka: each waiter hands over the money they took since their last handover. What the
-- till expected from them in cash, what was counted, and their card total, kept for history.
CREATE TABLE bluebar.waiter_handovers (
  id integer PRIMARY KEY CHECK (id > 0),
  waiter_id integer NOT NULL REFERENCES bluebar.waiters(id),
  created_at timestamptz NOT NULL,
  cash_expected bigint NOT NULL,
  cash_counted bigint NOT NULL CHECK (cash_counted >= 0),
  card bigint NOT NULL DEFAULT 0,
  tips bigint NOT NULL DEFAULT 0,
  invoices integer NOT NULL DEFAULT 0,
  note text CHECK (note IS NULL OR length(note) <= 300),
  actor text
);
CREATE INDEX waiter_handovers_waiter ON bluebar.waiter_handovers(waiter_id, created_at DESC);
