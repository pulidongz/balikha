CREATE TYPE "public"."product_moderation_status" AS ENUM('none', 'flagged', 'removed');--> statement-breakpoint
ALTER TYPE "public"."admin_action_type" ADD VALUE 'remove_product';--> statement-breakpoint
ALTER TYPE "public"."admin_action_type" ADD VALUE 'flag_product';--> statement-breakpoint
ALTER TYPE "public"."admin_action_type" ADD VALUE 'reinstate_product';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'listing_taken_down';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "moderation_status" "product_moderation_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "moderation_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "moderated_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "moderated_by" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_moderation_status_idx" ON "products" USING btree ("moderation_status");