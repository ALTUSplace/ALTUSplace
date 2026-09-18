ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'partner';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_salt" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agency_city" varchar(120);