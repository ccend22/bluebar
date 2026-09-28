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
-- original flow), pin_only (unique PIN alone identifies the waiter), or fingerprint
-- (visual preview only, see Login.jsx — falls back to name_pin for the real sign-in).
ALTER TABLE bluebar_catalog.venues ADD COLUMN IF NOT EXISTS login_mode text NOT NULL DEFAULT 'name_pin'
  CHECK (login_mode IN ('name_pin', 'pin_only', 'fingerprint'));
-- Database-backed registration budget shared by all serverless instances.
CREATE TABLE IF NOT EXISTS bluebar_catalog.registration_limits (
  ip_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
