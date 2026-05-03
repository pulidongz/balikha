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
CREATE INDEX "search_events_normalized_query_idx" ON "search_events" USING btree ("normalized_query");--> statement-breakpoint
CREATE INDEX "search_events_created_at_idx" ON "search_events" USING btree ("created_at");