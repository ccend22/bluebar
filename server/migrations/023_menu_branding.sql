-- How the online menu presents the venue: its logo, a one-line welcome, and the one
-- brand colour (from a curated set that reads on white) its buttons and badges use.
CREATE TABLE bluebar.menu_branding (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tagline text NOT NULL DEFAULT '' CHECK (length(tagline) <= 90),
  accent text NOT NULL DEFAULT 'blue' CHECK (accent IN ('blue', 'terracotta', 'olive', 'plum', 'teal', 'amber')),
  logo_type text CHECK (logo_type IN ('image/webp', 'image/png', 'image/jpeg')),
  logo bytea CHECK (octet_length(logo) <= 300000),
  logo_at timestamptz
);
INSERT INTO bluebar.menu_branding(id) VALUES (1);
