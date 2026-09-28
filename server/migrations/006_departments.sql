-- Kitchen/bar/pastry/pizza-station routing for line items — orthogonal to product
-- category (which describes what a product IS, not who prepares it). Mirrors
-- categories exactly: a manager-managed name list, referenced (not owned) by products.
CREATE TABLE bluebar.departments (name text PRIMARY KEY CHECK(length(trim(name)) BETWEEN 1 AND 40));
CREATE UNIQUE INDEX departments_name_ci ON bluebar.departments(lower(name));
ALTER TABLE bluebar.products ADD COLUMN department text REFERENCES bluebar.departments(name);
INSERT INTO bluebar.departments(name) VALUES ('Bar'),('Ëmbëltore'),('Restorant');
