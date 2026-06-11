CREATE TYPE "public"."artisan_cover_focus" AS ENUM('top', 'center', 'bottom');--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "profile_photo_url" text;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "craft_tags" text[];--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "external_links" jsonb;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "featured_product_id" uuid;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "cover_focus" "artisan_cover_focus" DEFAULT 'center' NOT NULL;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD CONSTRAINT "artisan_profiles_featured_product_id_products_id_fk" FOREIGN KEY ("featured_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;