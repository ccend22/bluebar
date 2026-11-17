-- What a guest sees on a dish's page in the online menu: its calories and its portion
-- ("330 ml", "250 g", "2 copë"). Both optional.
ALTER TABLE bluebar.products ADD COLUMN calories integer;
ALTER TABLE bluebar.products ADD COLUMN portion text NOT NULL DEFAULT '';
