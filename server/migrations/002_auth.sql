-- Accounts: waiters sign in with a PIN, managers with a password. Secrets are stored only as scrypt hashes.
CREATE TABLE bluebar.accounts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('waiter','manager')),
  waiter_id integer UNIQUE REFERENCES bluebar.waiters(id),
  username text UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  secret_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  CHECK (
    (role = 'waiter' AND waiter_id IS NOT NULL AND username IS NULL) OR
    (role = 'manager' AND waiter_id IS NULL AND username IS NOT NULL)
  )
);
-- Only the SHA-256 of the session token is stored, so a database leak does not yield usable cookies.
CREATE TABLE bluebar.sessions (
  token_hash text PRIMARY KEY,
  account_id integer NOT NULL REFERENCES bluebar.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_account ON bluebar.sessions(account_id);
