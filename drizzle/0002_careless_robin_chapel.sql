CREATE TABLE "buyer_blocked_sellers" (
	"buyer_user_id" text NOT NULL,
	"blocked_artisan_profile_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_blocked_sellers_buyer_user_id_blocked_artisan_profile_id_pk" PRIMARY KEY("buyer_user_id","blocked_artisan_profile_id")
);
--> statement-breakpoint
ALTER TABLE "buyer_blocked_sellers" ADD CONSTRAINT "buyer_blocked_sellers_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_blocked_sellers" ADD CONSTRAINT "buyer_blocked_sellers_blocked_artisan_profile_id_artisan_profiles_id_fk" FOREIGN KEY ("blocked_artisan_profile_id") REFERENCES "public"."artisan_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_blocked_sellers_blocked_artisan_idx" ON "buyer_blocked_sellers" USING btree ("blocked_artisan_profile_id");