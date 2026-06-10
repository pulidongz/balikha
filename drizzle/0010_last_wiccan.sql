CREATE TYPE "public"."product_sales_mode" AS ENUM('for_sale', 'showcase', 'commission_inquiries');--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sales_mode" "product_sales_mode" DEFAULT 'for_sale' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_for_sale_has_price" CHECK ("products"."sales_mode" <> 'for_sale' OR "products"."price" IS NOT NULL);