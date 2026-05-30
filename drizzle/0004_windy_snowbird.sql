CREATE TYPE "public"."analytics_event_type" AS ENUM('product_viewed', 'wishlist_added', 'artisan_followed', 'thread_started', 'order_placed', 'order_accepted', 'payment_received', 'order_completed', 'dispute_filed', 'seller_signup', 'first_listing', 'first_order');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"user_id" text,
	"artisan_profile_id" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_events_type_created_idx" ON "analytics_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_artisan_idx" ON "analytics_events" USING btree ("artisan_profile_id");