-- A table can carry its own name ("VIP", "Tarraca 2"); empty means it is shown by its number.
ALTER TABLE bluebar.dining_tables ADD COLUMN label text NOT NULL DEFAULT '';
