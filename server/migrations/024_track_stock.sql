-- Not everything is counted in units: an espresso, a cocktail or a dish made to order has
-- no stock to enter, while bottles and cans do. A product that doesn't track stock is
-- always orderable and never warns; the existing ones keep tracking, as before.
ALTER TABLE bluebar.products ADD COLUMN track_stock boolean NOT NULL DEFAULT true;
