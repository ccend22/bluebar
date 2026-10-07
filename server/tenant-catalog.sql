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
