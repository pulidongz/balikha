-- pg_trgm enables % similarity operator and gin_trgm_ops index type, used
-- for fuzzy matching to handle typos like "vse" matching "vase". Required
-- before the gin_trgm_ops indexes below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- Postgres marks `array_to_string` as STABLE (its behavior depends on the
-- text representation of the array's element type, which can be locale-
-- dependent for some types). Generated column expressions must be
-- IMMUTABLE, so a STABLE function inside one is rejected by the planner.
-- For text[] specifically the result IS deterministic, so we wrap in an
-- IMMUTABLE SQL function. STRICT means NULL inputs short-circuit to NULL,
-- matching `array_to_string`'s actual behavior.
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
  AS $$ SELECT array_to_string($1, $2) $$;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(shop_name, '')), 'A') || setweight(to_tsvector('english', coalesce(location, '')), 'B') || setweight(to_tsvector('english', coalesce(bio, '')), 'C')) STORED;--> statement-breakpoint
ALTER TABLE "catalogs" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(immutable_array_to_string(materials, ' '), '')), 'B') || setweight(to_tsvector('english', coalesce(description, '')), 'C')) STORED;--> statement-breakpoint
CREATE INDEX "artisan_profiles_search_idx" ON "artisan_profiles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "artisan_profiles_shop_name_trgm" ON "artisan_profiles" USING gin ("shop_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalogs_search_idx" ON "catalogs" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "products_title_trgm" ON "products" USING gin ("title" gin_trgm_ops);