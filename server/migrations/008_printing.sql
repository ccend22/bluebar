-- Network (ESC/POS, raw TCP) printers on the venue's LAN. BlueBar runs in the cloud and
-- can't reach them, so a small print agent inside the venue (public/bluebar-print.mjs)
-- pulls jobs from this queue and sends each to its printer.
CREATE TABLE bluebar.printers (
  id serial PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  host text NOT NULL,
  port integer NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
  width integer NOT NULL DEFAULT 48 CHECK (width IN (32, 42, 48)),
  departments text[] NOT NULL DEFAULT '{}',
  receipts boolean NOT NULL DEFAULT false
);
-- What to print, not how: the document is rendered from the current data when the agent
-- fetches it (so an invoice printed after fiscalization carries its NIVF/NSLF).
CREATE TABLE bluebar.print_jobs (
  id text PRIMARY KEY,
  printer_id integer NOT NULL REFERENCES bluebar.printers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ticket', 'cancel', 'invoice', 'test')),
  ref text NOT NULL,
  wait_fiscal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX print_jobs_pending ON bluebar.print_jobs(created_at) WHERE printed_at IS NULL;
-- One agent key per business; only its hash is stored.
CREATE TABLE bluebar.print_agent (
  id integer PRIMARY KEY CHECK (id = 1),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz
);
