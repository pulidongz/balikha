CREATE TABLE "studio_update_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artisan_profile_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_update_images" ADD CONSTRAINT "studio_update_images_update_id_studio_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."studio_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_updates" ADD CONSTRAINT "studio_updates_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_update_images_update_idx" ON "studio_update_images" USING btree ("update_id");--> statement-breakpoint
CREATE INDEX "studio_updates_artisan_created_idx" ON "studio_updates" USING btree ("artisan_profile_id","created_at");