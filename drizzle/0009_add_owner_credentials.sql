ALTER TABLE "platform_settings" ADD COLUMN "owner_password_hash" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "owner_password_salt" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "session_secret" text;