CREATE TYPE "public"."message_report_status" AS ENUM('open', 'reviewed_actioned', 'reviewed_dismissed');--> statement-breakpoint
CREATE TYPE "public"."message_sender_role" AS ENUM('buyer', 'seller');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'new_message';--> statement-breakpoint
CREATE TABLE "message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"reporter_user_id" text NOT NULL,
	"reason" text,
	"status" "message_report_status" DEFAULT 'open' NOT NULL,
	"reviewed_by_admin_user_id" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_user_id" text NOT NULL,
	"artisan_profile_id" uuid NOT NULL,
	"product_id" uuid,
	"product_title_snapshot" text NOT NULL,
	"product_slug_snapshot" text NOT NULL,
	"product_image_url_snapshot" text,
	"artisan_shop_slug_snapshot" text NOT NULL,
	"artisan_shop_name_snapshot" text NOT NULL,
	"order_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_role" "message_sender_role" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"seq" bigserial NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_blocked_buyers" (
	"artisan_profile_id" uuid NOT NULL,
	"blocked_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_blocked_buyers_artisan_profile_id_blocked_user_id_pk" PRIMARY KEY("artisan_profile_id","blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "thread_id" uuid;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reviewed_by_admin_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_admin_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_blocked_buyers" ADD CONSTRAINT "seller_blocked_buyers_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_blocked_buyers" ADD CONSTRAINT "seller_blocked_buyers_blocked_user_id_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_reports_status_idx" ON "message_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_reports_message_idx" ON "message_reports" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_open_per_reporter_idx" ON "message_reports" USING btree ("message_id","reporter_user_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "message_threads_buyer_idx" ON "message_threads" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE INDEX "message_threads_artisan_idx" ON "message_threads" USING btree ("artisan_profile_id");--> statement-breakpoint
CREATE INDEX "message_threads_order_idx" ON "message_threads" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "message_threads_buyer_updated_idx" ON "message_threads" USING btree ("buyer_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "message_threads_artisan_updated_idx" ON "message_threads" USING btree ("artisan_profile_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_threads_active_pre_purchase_idx" ON "message_threads" USING btree ("buyer_user_id","product_id") WHERE order_id IS NULL;--> statement-breakpoint
CREATE INDEX "messages_thread_seq_idx" ON "messages" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE INDEX "messages_sender_created_idx" ON "messages" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "seller_blocked_buyers_blocked_user_idx" ON "seller_blocked_buyers" USING btree ("blocked_user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_thread_unread_idx" ON "notifications" USING btree ("user_id","thread_id") WHERE thread_id IS NOT NULL AND read_at IS NULL;