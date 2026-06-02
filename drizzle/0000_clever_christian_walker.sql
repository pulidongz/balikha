CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
  AS $$ SELECT array_to_string($1, $2) $$;--> statement-breakpoint
CREATE TYPE "public"."cancellation_reason" AS ENUM('seller_no_response', 'buyer_changed_mind', 'seller_unable_to_fulfill', 'item_unavailable', 'payment_disagreement', 'shipping_disagreement', 'other');--> statement-breakpoint
CREATE TYPE "public"."catalog_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved_for_buyer', 'resolved_for_seller', 'resolved_neutral');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('follow_new_listing', 'wishlist_back_in_stock', 'wishlist_low_stock', 'order_status_changed', 'system_announcement');--> statement-breakpoint
CREATE TYPE "public"."order_event_type" AS ENUM('placed', 'accepted', 'declined', 'payment_received', 'shipped', 'completed', 'cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled', 'disputed', 'dispute_resolved', 'admin_intervention');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_seller_response', 'pending_payment_arrangement', 'payment_received', 'shipped', 'completed', 'cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'sold_out', 'archived');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artisan_follows" (
	"user_id" text NOT NULL,
	"artisan_profile_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artisan_follows_user_id_artisan_profile_id_pk" PRIMARY KEY("user_id","artisan_profile_id")
);
--> statement-breakpoint
CREATE TABLE "artisan_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"shop_slug" text NOT NULL,
	"shop_name" text NOT NULL,
	"bio" text,
	"banner_image_url" text,
	"location" text,
	"policies" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(shop_name, '')), 'A') || setweight(to_tsvector('english', coalesce(location, '')), 'B') || setweight(to_tsvector('english', coalesce(bio, '')), 'C')) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artisan_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "artisan_profiles_shop_slug_unique" UNIQUE("shop_slug")
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artisan_profile_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "catalog_status" DEFAULT 'draft' NOT NULL,
	"release_at" timestamp,
	"closes_at" timestamp,
	"is_limited_edition" boolean DEFAULT false NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"scope" text NOT NULL,
	"response_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"target" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"filed_by_user_id" text NOT NULL,
	"filed_by_role" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"buyer_statement" text,
	"seller_statement" text,
	"admin_resolution" text,
	"resolved_by_admin_user_id" text,
	"filed_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "order_event_type" NOT NULL,
	"actor_user_id" text,
	"actor_role" text NOT NULL,
	"notes" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_user_id" text NOT NULL,
	"artisan_profile_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "order_status" DEFAULT 'pending_seller_response' NOT NULL,
	"product_id" uuid,
	"product_title_snapshot" text NOT NULL,
	"product_slug_snapshot" text NOT NULL,
	"product_image_url_snapshot" text,
	"artisan_name_snapshot" text NOT NULL,
	"artisan_slug_snapshot" text NOT NULL,
	"price_snapshot" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"shipping_address_json" jsonb NOT NULL,
	"notes_from_buyer" text,
	"placed_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"payment_received_at" timestamp,
	"shipped_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" "cancellation_reason",
	"cancellation_notes" text,
	"disputed_at" timestamp,
	"dispute_resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text,
	"url" text NOT NULL,
	"alt_text" text,
	"position" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"artisan_profile_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"dimensions" jsonb,
	"materials" text[],
	"weight_grams" integer,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(immutable_array_to_string(materials, ' '), '')), 'B') || setweight(to_tsvector('english', coalesce(description, '')), 'C')) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recently_viewed" (
	"user_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recently_viewed_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"result_count" integer NOT NULL,
	"product_result_count" integer NOT NULL,
	"artisan_result_count" integer NOT NULL,
	"catalog_result_count" integer NOT NULL,
	"had_filters" boolean DEFAULT false NOT NULL,
	"was_logged_in" boolean DEFAULT false NOT NULL,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text,
	"recipient_name" text NOT NULL,
	"phone" text,
	"line1" text NOT NULL,
	"line2" text,
	"barangay" text,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"postal_code" text,
	"country_code" text DEFAULT 'PH' NOT NULL,
	"is_default_shipping" boolean DEFAULT false NOT NULL,
	"is_default_billing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"list_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artisan_follows" ADD CONSTRAINT "artisan_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artisan_follows" ADD CONSTRAINT "artisan_follows_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD CONSTRAINT "artisan_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_filed_by_user_id_user_id_fk" FOREIGN KEY ("filed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_resolved_by_admin_user_id_user_id_fk" FOREIGN KEY ("resolved_by_admin_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artisan_follows_artisan_idx" ON "artisan_follows" USING btree ("artisan_profile_id");--> statement-breakpoint
CREATE INDEX "artisan_follows_user_idx" ON "artisan_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artisan_profiles_search_idx" ON "artisan_profiles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "artisan_profiles_shop_name_trgm" ON "artisan_profiles" USING gin ("shop_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalogs_artisan_idx" ON "catalogs" USING btree ("artisan_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogs_slug_per_artisan" ON "catalogs" USING btree ("artisan_profile_id","slug");--> statement-breakpoint
CREATE INDEX "catalogs_search_idx" ON "catalogs" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "order_disputes_order_idx" ON "order_disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_disputes_status_idx" ON "order_disputes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_disputes_active_per_order" ON "order_disputes" USING btree ("order_id") WHERE status IN ('open', 'under_review');--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_created_at_idx" ON "order_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE INDEX "orders_artisan_idx" ON "orders" USING btree ("artisan_profile_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_placed_at_idx" ON "orders" USING btree ("placed_at");--> statement-breakpoint
CREATE INDEX "orders_artisan_status_idx" ON "orders" USING btree ("artisan_profile_id","status");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_catalog_idx" ON "products" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "products_artisan_idx" ON "products" USING btree ("artisan_profile_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_per_artisan" ON "products" USING btree ("artisan_profile_id","slug");--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "products_title_trgm" ON "products" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_materials_idx" ON "products" USING gin ("materials");--> statement-breakpoint
CREATE INDEX "recently_viewed_user_last_viewed_idx" ON "recently_viewed" USING btree ("user_id","last_viewed_at");--> statement-breakpoint
CREATE INDEX "search_events_normalized_query_idx" ON "search_events" USING btree ("normalized_query");--> statement-breakpoint
CREATE INDEX "search_events_created_at_idx" ON "search_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_addresses_user_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_user_idx" ON "wishlist_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_product_idx" ON "wishlist_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_unique_per_user" ON "wishlist_items" USING btree ("user_id","product_id");