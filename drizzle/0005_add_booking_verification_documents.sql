ALTER TABLE "bookings" ADD COLUMN "residency" varchar(16);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driving_license_key" varchar(512);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driving_license_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driving_license_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "identity_document_key" varchar(512);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "identity_document_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "identity_document_mime_type" varchar(100);