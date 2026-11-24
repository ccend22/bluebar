-- Menaxho sallën → Dyshemeja: a colour laid over the floor's material (its planks or stone
-- show through); null = the material's own colour.
ALTER TABLE bluebar.control ADD COLUMN floor_color text CHECK (floor_color ~ '^#[0-9a-f]{6}$');
