-- The 3D floor: furniture and floor drawings made from the venue's own photos. A table may
-- wear one ("table"); the room's floor may be one ("floor").
CREATE TABLE bluebar.floor_assets (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('table', 'floor')),
  name text NOT NULL,
  type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bluebar.dining_tables ADD COLUMN sprite uuid REFERENCES bluebar.floor_assets(id) ON DELETE SET NULL;
ALTER TABLE bluebar.control ADD COLUMN floor_texture uuid REFERENCES bluebar.floor_assets(id) ON DELETE SET NULL;
-- How the room is drawn on Tavolinat, the manager's choice for the venue: "3d" (a rendered
-- plan: wood floor, wooden tables) or "flat" (plain cards).
ALTER TABLE bluebar.control ADD COLUMN floor_style text NOT NULL DEFAULT '3d' CHECK (floor_style IN ('3d', 'flat'));
