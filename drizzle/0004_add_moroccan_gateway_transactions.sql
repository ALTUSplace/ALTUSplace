ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'payzone';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'paytabs';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'cashplus';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'wafacash';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'arrival';--> statement-breakpoint
CREATE TYPE "public"."transaction_gateway" AS ENUM('payzone', 'paytabs', 'cashplus', 'wafacash', 'arrival');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'paid', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" integer NOT NULL,
	"gateway" "transaction_gateway" NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'MAD' NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"external_reference" varchar(120),
	"expires_at" timestamp,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "transactions_booking_id_idx" ON "transactions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "transactions_gateway_status_idx" ON "transactions" USING btree ("gateway","status");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_reference_unique" ON "transactions" USING btree ("external_reference");