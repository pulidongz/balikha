ALTER TABLE "user" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "accepted_terms_at" timestamp;
--> statement-breakpoint
-- Backfill structured names from the legacy single `name` column.
-- first_name = first whitespace token; last_name = the remainder (NULL if none).
UPDATE "user"
SET
  "first_name" = split_part(trim("name"), ' ', 1),
  "last_name" = CASE
    WHEN position(' ' IN trim("name")) > 0
    THEN trim(substring(trim("name") FROM position(' ' IN trim("name")) + 1))
    ELSE NULL
  END
WHERE "name" IS NOT NULL AND trim("name") <> '';