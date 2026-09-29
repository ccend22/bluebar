-- Each business connects its own BlueBill account. The token is stored encrypted
-- (AES-256-GCM, key only in the server's BLUEBAR_SECRET_KEY, bound to this schema)
-- and never returned to a browser — only its hint ("bb_test_…nxUQ") is.
CREATE TABLE bluebar.bluebill_connection (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token_cipher text NOT NULL,
  token_hint text NOT NULL CHECK (char_length(token_hint) <= 40),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  connected_by text,
  connected_at timestamptz NOT NULL DEFAULT now()
);
