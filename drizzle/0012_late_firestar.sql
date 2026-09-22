CREATE TYPE "public"."partner_application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."partner_application_type" AS ENUM('car_rental', 'real_estate');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'partner' BEFORE 'user';--> statement-breakpoint
CREATE TABLE "partner_applications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "partner_applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "partner_application_type" NOT NULL,
	"status" "partner_application_status" DEFAULT 'pending' NOT NULL,
	"agency_name" varchar(180) NOT NULL,
	"city" varchar(120) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(320) NOT NULL,
	"website" varchar(255),
	"contact_person" varchar(120),
	"fleet_size" integer,
	"property_count" integer,
	"description" text,
	"logo_url" text,
	"gallery_urls" text[],
	"password_hash" text,
	"password_salt" varchar(64),
	"admin_note" text,
	"reviewed_at" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_salt" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agency_city" varchar(120);