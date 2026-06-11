ALTER TYPE "public"."analytics_event_type" ADD VALUE 'work_appreciated' BEFORE 'thread_started';--> statement-breakpoint
CREATE TABLE "appreciations" (
	"user_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appreciations_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "appreciations" ADD CONSTRAINT "appreciations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appreciations" ADD CONSTRAINT "appreciations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appreciations_product_idx" ON "appreciations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "appreciations_user_idx" ON "appreciations" USING btree ("user_id");