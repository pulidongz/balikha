CREATE TYPE "public"."artisan_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'seller_application_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'seller_application_rejected';--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "approval_status" "artisan_approval_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "approval_note" text;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD COLUMN "reviewed_by_id" text;--> statement-breakpoint
ALTER TABLE "artisan_profiles" ADD CONSTRAINT "artisan_profiles_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
-- Grandfather all pre-existing sellers. New rows created after this migration
-- take the column DEFAULT ('pending'). This UPDATE runs AFTER the column is
-- added, so it is safe and idempotent on a freshly seeded DB (no-op if seed
-- already inserts with approvalStatus:'approved').
UPDATE artisan_profiles SET approval_status = 'approved';