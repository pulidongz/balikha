ALTER TYPE "public"."notification_type" ADD VALUE 'new_follower';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'work_appreciated';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'work_commented';--> statement-breakpoint
CREATE TABLE "email_digest_opt_outs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_digest_opt_outs" ADD CONSTRAINT "email_digest_opt_outs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;