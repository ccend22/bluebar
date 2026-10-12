-- The online menu in several languages: every translation of a product or category in one
-- column, {"en": {"name": …, "description": …}, "it": {…}}, written by the translator.
-- The English columns move into it.
ALTER TABLE bluebar.products ADD COLUMN i18n jsonb NOT NULL DEFAULT '{}';
UPDATE bluebar.products SET i18n = jsonb_build_object('en', jsonb_build_object('name', name_en, 'description', description_en))
  WHERE name_en <> '';
ALTER TABLE bluebar.products DROP COLUMN name_en, DROP COLUMN description_en;
ALTER TABLE bluebar.categories ADD COLUMN i18n jsonb NOT NULL DEFAULT '{}';
UPDATE bluebar.categories SET i18n = jsonb_build_object('en', jsonb_build_object('name', name_en)) WHERE name_en <> '';
ALTER TABLE bluebar.categories DROP COLUMN name_en;
-- Foreign guests can see prices in euro, at the venue's own rate (Lek for 1 €).
ALTER TABLE bluebar.menu_branding
  ADD COLUMN euro boolean NOT NULL DEFAULT false,
  ADD COLUMN euro_rate numeric(8,2) NOT NULL DEFAULT 100 CHECK (euro_rate > 0);
-- The audit log: who ran each command, and with what.
ALTER TABLE bluebar.commands ADD COLUMN actor text, ADD COLUMN payload jsonb;
CREATE INDEX commands_created_at ON bluebar.commands(created_at);
