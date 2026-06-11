CREATE TABLE "homepage_feature" (
	"id" text PRIMARY KEY DEFAULT 'homepage' NOT NULL,
	"artisan_profile_id" uuid,
	"editorial_text" text,
	"featured_product_ids" uuid[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
ALTER TABLE "homepage_feature" ADD CONSTRAINT "homepage_feature_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_feature" ADD CONSTRAINT "homepage_feature_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;