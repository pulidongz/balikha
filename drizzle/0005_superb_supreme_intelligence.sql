-- GIN array index so the `materials && $1::text[]` filter in
-- searchProducts uses an index instead of a sequential scan.
--
-- (Drizzle's generated diff also wanted to DROP and re-ADD products.search_vector
-- — that's spurious snapshot noise, and worse, dropping the column would
-- silently drop the dependent products_search_idx GIN index without recreating
-- it. The expression text is unchanged from migration 0004; nothing to do.)
CREATE INDEX "products_materials_idx" ON "products" USING gin ("materials");
