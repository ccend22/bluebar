ALTER TABLE bluebar.dining_tables
  ADD COLUMN table_color text CHECK (table_color ~ '^#[0-9a-f]{6}$'),
  ADD COLUMN chair_color text CHECK (chair_color ~ '^#[0-9a-f]{6}$');
