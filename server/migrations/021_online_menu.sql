-- The public online menu (/menu/<business>) reads the same products the till sells:
-- one price, one place to change it. These are only what a guest sees, in Albanian and
-- English. A product is shown unless the manager hides it.
ALTER TABLE bluebar.products
  ADD COLUMN name_en text NOT NULL DEFAULT '' CHECK (length(name_en) <= 80),
  ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  ADD COLUMN description_en text NOT NULL DEFAULT '' CHECK (length(description_en) <= 300),
  ADD COLUMN menu_visible boolean NOT NULL DEFAULT true,
  -- When the photo last changed (null: none). It versions the photo's URL, so a new photo
  -- is never hidden behind an old cached one.
  ADD COLUMN photo_at timestamptz;
ALTER TABLE bluebar.categories ADD COLUMN name_en text NOT NULL DEFAULT '' CHECK (length(name_en) <= 40);
-- Photos live apart from products: the till loads every product on each change, and must
-- never drag the images along.
CREATE TABLE bluebar.product_photos (
  product_id integer PRIMARY KEY REFERENCES bluebar.products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image/webp', 'image/jpeg')),
  data bytea NOT NULL CHECK (octet_length(data) <= 400000)
);
