-- Menaxho sallën: what furnishes the room besides tables (walls, doors, windows, plants, sofas,
-- a counter, rugs, signs), each { id, kind, x, y, w, h, r, text?, area? } in percent of the room;
-- and the floor it stands on when no photo floor is laid.
ALTER TABLE bluebar.control ADD COLUMN floor_objects jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bluebar.control ADD COLUMN floor_material text NOT NULL DEFAULT 'oak' CHECK (floor_material IN ('oak', 'walnut', 'concrete', 'terrazzo'));

-- Kamarierët: a waiter works one room (a table zone, as the tills see them) or all of them,
-- not a till; and can be removed after being switched off (kept for the invoices' history,
-- hidden everywhere else). A waiter tied to a till of a single zone keeps that zone.
ALTER TABLE bluebar.waiters ADD COLUMN area text CHECK (area IS NULL OR length(trim(area)) BETWEEN 1 AND 40);
ALTER TABLE bluebar.waiters ADD COLUMN deleted boolean NOT NULL DEFAULT false;
UPDATE bluebar.waiters w SET area = p.areas[1] FROM bluebar.points_of_sale p WHERE w.pos_id = p.id AND array_length(p.areas, 1) = 1;
-- A removed waiter's name is free for a new one: names are unique among those still on the team.
DROP INDEX bluebar.waiters_name_ci;
CREATE UNIQUE INDEX waiters_name_ci ON bluebar.waiters(lower(name)) WHERE NOT deleted;
