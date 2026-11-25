-- Additive migration: existing data stays in the original business.
CREATE SCHEMA IF NOT EXISTS bluebar_catalog;
CREATE TABLE IF NOT EXISTS bluebar_catalog.venues (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  schema_name text UNIQUE NOT NULL CHECK (schema_name = 'bluebar' OR schema_name ~ '^bluebar_[a-f0-9]{32}$'),
  allowed_ips text[] NOT NULL DEFAULT '{}',
  use_legacy_network boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bluebar_catalog.venues(slug, name, schema_name, use_legacy_network)
VALUES ('bluebar', 'BlueBar', 'bluebar', true) ON CONFLICT DO NOTHING;
-- How waiters sign in on this venue's PIN screen: name_pin (pick a name, then PIN — the
-- original flow), pin_only (unique PIN alone identifies the waiter), or pattern (pick a
-- name, then draw a 3x3 pattern).
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS login_mode text NOT NULL DEFAULT 'name_pin'
  CHECK (login_mode IN ('name_pin', 'pin_only', 'pattern'));
-- Existing fingerprint previews had no pattern credential. Keep those venues on
-- working PIN login until a manager sets patterns and opts into the new mode.
ALTER TABLE bluebar_catalog.venues DROP CONSTRAINT IF EXISTS venues_login_mode_check;
UPDATE bluebar_catalog.venues SET login_mode = 'name_pin' WHERE login_mode = 'fingerprint';
ALTER TABLE bluebar_catalog.venues ADD CONSTRAINT venues_login_mode_check
  CHECK (login_mode IN ('name_pin', 'pin_only', 'pattern'));
-- Database-backed registration budget shared by all serverless instances.
CREATE TABLE IF NOT EXISTS bluebar_catalog.registration_limits (
  ip_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
-- One-time codes that pair a venue computer with BlueBar printing (Cilësimet → Printerët).
-- The computer doesn't know its business yet, so codes live here, not in a tenant schema.
CREATE TABLE IF NOT EXISTS bluebar_catalog.print_pairings (
  code_hash text PRIMARY KEY,
  venue_slug text NOT NULL REFERENCES bluebar_catalog.venues(slug) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
-- How the manager signs in: pin_only (the PIN alone, the original flow) or name_pin
-- (their username, then the PIN).
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS manager_login text NOT NULL DEFAULT 'pin_only'
  CHECK (manager_login IN ('pin_only', 'name_pin'));
-- The public online menu is off until the manager turns it on (Cilësimet → Menuja online).
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS menu_enabled boolean NOT NULL DEFAULT false;
-- Guests ordering from the menu (needs the menu on), and the secret that signs each
-- table's QR code so an order can only come from someone holding that table's code.
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS menu_ordering boolean NOT NULL DEFAULT false;
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS menu_secret text;
-- The LuxHotel account (Firebase uid of the LuxHotel PMS) whose owner signs in as this
-- business's manager with "Hyr me LuxHotel". One business per LuxHotel account.
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS luxhotel_uid text UNIQUE;

-- OAuth connections name the business before a request can select a tenant schema.
-- Only hashes of authorization codes and bearer credentials are stored.
CREATE TABLE IF NOT EXISTS bluebar_catalog.mcp_connections (
  id uuid PRIMARY KEY,
  venue_slug text NOT NULL REFERENCES bluebar_catalog.venues(slug) ON DELETE CASCADE,
  manager_id integer NOT NULL,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  resource text NOT NULL,
  approval_hash text UNIQUE NOT NULL,
  code_hash text UNIQUE,
  code_challenge text NOT NULL,
  code_expires_at timestamptz NOT NULL,
  access_hash text UNIQUE,
  access_expires_at timestamptz,
  refresh_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_connections_venue_idx ON bluebar_catalog.mcp_connections(venue_slug);
CREATE INDEX IF NOT EXISTS mcp_connections_expiry_idx ON bluebar_catalog.mcp_connections(expires_at);
ALTER TABLE bluebar_catalog.mcp_connections ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['bluebar.read'];

-- One read-only API key per business for a ChatGPT Custom GPT (server/gpt.js).
-- Only the key's SHA-256 is stored; deleting the row revokes it.
CREATE TABLE IF NOT EXISTS bluebar_catalog.gpt_keys (
  venue_slug text PRIMARY KEY REFERENCES bluebar_catalog.venues(slug) ON DELETE CASCADE,
  key_hash text UNIQUE NOT NULL,
  hint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Superadmin (BlueSquare, /admin): a business can be switched off, e.g. while its
-- subscription is unpaid. Off, nobody in it can sign in or use its menu, GPT or MCP.
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS suspended_reason text;
-- Each business's subscription to BlueBar: its plan, the monthly price in Lek, and the day
-- it is paid until (null: nothing paid yet).
CREATE TABLE IF NOT EXISTS bluebar_catalog.subscriptions (
  venue_slug text PRIMARY KEY REFERENCES bluebar_catalog.venues(slug) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'Standard' CHECK (length(trim(plan)) BETWEEN 1 AND 40),
  monthly_price integer NOT NULL DEFAULT 0 CHECK (monthly_price BETWEEN 0 AND 10000000),
  paid_until date,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Every payment recorded by hand: how much, when, the months it covers and how it came in.
CREATE TABLE IF NOT EXISTS bluebar_catalog.subscription_payments (
  id uuid PRIMARY KEY,
  venue_slug text NOT NULL REFERENCES bluebar_catalog.venues(slug) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 100000000),
  paid_on date NOT NULL,
  months integer NOT NULL CHECK (months BETWEEN 1 AND 24),
  covers_from date NOT NULL,
  covers_to date NOT NULL CHECK (covers_to >= covers_from),
  method text NOT NULL CHECK (method IN ('Cash', 'Bankë')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_venue_idx ON bluebar_catalog.subscription_payments(venue_slug, created_at DESC);
-- What each superadmin did, and to which business. Kept when the business is deleted.
CREATE TABLE IF NOT EXISTS bluebar_catalog.admin_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  admin_email text NOT NULL,
  action text NOT NULL,
  venue_slug text,
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS admin_log_at_idx ON bluebar_catalog.admin_log(at DESC);
-- The superadmins themselves: an email and a password (scrypt, like the PINs). Created and
-- reset with `npm run auth:admin -- <email>`. session_version goes up when the password
-- changes, which signs that superadmin out everywhere else.
CREATE TABLE IF NOT EXISTS bluebar_catalog.admin_accounts (
  email text PRIMARY KEY CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text NOT NULL,
  session_version integer NOT NULL DEFAULT 1,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
