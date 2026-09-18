ALTER TABLE "listings" ADD COLUMN "images" text[];--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "seats" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "area" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "floor" integer;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "owner_password_hash" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "owner_password_salt" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "session_secret" text;