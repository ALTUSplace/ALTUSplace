CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'banned');--> statement-breakpoint
CREATE TYPE "public"."analytics_event_type" AS ENUM('view', 'whatsapp_click', 'contact_click');--> statement-breakpoint
CREATE TYPE "public"."applicant_role" AS ENUM('renter', 'owner', 'company');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('Pending', 'Confirmed', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."commission_mode" AS ENUM('percent', 'flat');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('Draft', 'Generated', 'Signed');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('Open', 'UnderReview', 'Resolved', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('not_sent', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."escrow_status" AS ENUM('held', 'releasable', 'released', 'frozen', 'mediated');--> statement-breakpoint
CREATE TYPE "public"."escrow_transfer_status" AS ENUM('pending', 'sent', 'held', 'failed', 'released');--> statement-breakpoint
CREATE TYPE "public"."ical_sync_status" AS ENUM('never', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('Pending', 'Issued');--> statement-breakpoint
CREATE TYPE "public"."kyc_submission_status" AS ENUM('Pending', 'Approved', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."lease_type" AS ENUM('commercial', 'professional');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('Pending', 'Approved', 'Available', 'Rented', 'Rejected', 'Published');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('booking_new', 'booking_accepted', 'booking_rejected', 'listing_approved', 'listing_rejected', 'lease_expiring', 'voucher_issued', 'system');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cmi_card', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('Pending', 'Succeeded', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('bank_transfer', 'cash_plus', 'wafacash');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('Pending', 'Approved', 'Paid', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."refund_request_status" AS ENUM('Pending', 'Approved', 'Rejected', 'Paid');--> statement-breakpoint
CREATE TYPE "public"."rental_period" AS ENUM('daily', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('Open', 'InProgress', 'Resolved');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('renter', 'owner', 'admin', 'user', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."vendor_tier" AS ENUM('bronze', 'silver', 'gold');--> statement-breakpoint
CREATE TYPE "public"."voucher_status" AS ENUM('Issued', 'Revoked');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"audit_log_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actor_id" integer NOT NULL,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" integer,
	"before_data" text,
	"after_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_messages" (
	"message_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_messages_message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_vouchers" (
	"voucher_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_vouchers_voucher_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"renter_id" integer NOT NULL,
	"code" varchar(80) NOT NULL,
	"qr_payload" text NOT NULL,
	"status" "voucher_status" DEFAULT 'Issued' NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_vouchers_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "booking_vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"booking_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bookings_booking_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"renter_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"secondary_listing_id" integer,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"total_price" integer NOT NULL,
	"commission_fee" integer NOT NULL,
	"net_profit" integer NOT NULL,
	"status" "booking_status" DEFAULT 'Pending' NOT NULL,
	"cancellation_policy_version" varchar(80),
	"cancellation_policy_snapshot" text,
	"cancellation_policy_fingerprint" varchar(80),
	"cancellation_policy_accepted_at" timestamp,
	"cancellation_policy_accepted_by" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_lease_contracts" (
	"contract_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "commercial_lease_contracts_contract_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"landlord_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"reference" varchar(80) NOT NULL,
	"lease_type" "lease_type" NOT NULL,
	"landlord_name" varchar(255) NOT NULL,
	"landlord_rc" varchar(120),
	"tenant_name" varchar(255) NOT NULL,
	"premises" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"monthly_rent" integer NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"pdf_key" varchar(512),
	"status" "contract_status" DEFAULT 'Generated' NOT NULL,
	"legal_notice" text NOT NULL,
	"lease_end_reminder_task_uid" varchar(65),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_lease_contracts_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "commercial_lease_contracts_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "commission_tiers" (
	"tier_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "commission_tiers_tier_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tier" "vendor_tier" NOT NULL,
	"mode" "commission_mode" DEFAULT 'percent' NOT NULL,
	"percent_basis_points" integer DEFAULT 1000 NOT NULL,
	"flat_amount" integer DEFAULT 0 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commission_tiers_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE "dispute_attachments" (
	"attachment_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dispute_attachments_attachment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"dispute_id" integer NOT NULL,
	"file_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"dispute_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "disputes_dispute_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"opened_by" integer NOT NULL,
	"type" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"status" "dispute_status" DEFAULT 'Open' NOT NULL,
	"resolution_note" text,
	"reviewed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_ledger" (
	"escrow_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "escrow_ledger_escrow_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"guest_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"listing_category" varchar(64) NOT NULL,
	"total_paid" integer NOT NULL,
	"platform_cut" integer NOT NULL,
	"vendor_payout_share" integer NOT NULL,
	"release_date" timestamp NOT NULL,
	"stripe_transfer_status" "escrow_transfer_status" DEFAULT 'pending' NOT NULL,
	"stripe_transfer_id" varchar(120),
	"status" "escrow_status" DEFAULT 'held' NOT NULL,
	"mediation_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"invoice_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoices_invoice_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_number" varchar(80) NOT NULL,
	"booking_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"payer_id" integer NOT NULL,
	"subtotal" integer NOT NULL,
	"commission_fee" integer NOT NULL,
	"vat_rate_basis_points" integer DEFAULT 2000 NOT NULL,
	"vat_amount" integer NOT NULL,
	"total" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'MAD' NOT NULL,
	"status" "invoice_status" DEFAULT 'Issued' NOT NULL,
	"cancellation_policy_version" varchar(80),
	"cancellation_policy_snapshot" text,
	"cancellation_policy_fingerprint" varchar(80),
	"cancellation_policy_accepted_at" timestamp,
	"cancellation_policy_accepted_by" integer,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "kyc_submissions" (
	"kyc_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kyc_submissions_kyc_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"applicant_role" "applicant_role" DEFAULT 'renter' NOT NULL,
	"document_type" varchar(24) NOT NULL,
	"document_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"provider" varchar(40) DEFAULT 'manual' NOT NULL,
	"provider_session_id" varchar(128),
	"file_size" integer,
	"document_number_masked" varchar(32),
	"expiry_date" timestamp,
	"category_context" varchar(32),
	"status" "kyc_submission_status" DEFAULT 'Pending' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "listing_analytics_events" (
	"event_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listing_analytics_events_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"listing_id" integer NOT NULL,
	"event_type" "analytics_event_type" NOT NULL,
	"visitor_key" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_comments" (
	"comment_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listing_comments_comment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"listing_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"parent_id" integer,
	"body" text NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"listing_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listings_listing_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" varchar(64) NOT NULL,
	"price_per_day" integer NOT NULL,
	"image_url" text,
	"status" "listing_status" DEFAULT 'Published' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"city" varchar(64) DEFAULT 'الدار البيضاء' NOT NULL,
	"fuel_type" varchar(32) DEFAULT 'ديزل',
	"transmission" varchar(32) DEFAULT 'أوتوماتيك',
	"rooms" integer DEFAULT 0,
	"office_type" varchar(64),
	"rental_period" "rental_period",
	"amenities" text,
	"availability" text,
	"ical_import_url" text,
	"ical_export_token" varchar(96),
	"ical_imported_ranges" text,
	"ical_last_synced_at" timestamp,
	"ical_sync_status" "ical_sync_status" DEFAULT 'never' NOT NULL,
	"ical_sync_error" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listings_ical_export_token_unique" UNIQUE("ical_export_token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notification_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_notification_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"href" varchar(512),
	"entity_type" varchar(64),
	"entity_id" integer,
	"read_at" timestamp,
	"email_status" "email_status" DEFAULT 'not_sent' NOT NULL,
	"email_sent_at" timestamp,
	"dedupe_key" varchar(191),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"payment_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"payer_id" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'Pending' NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'MAD' NOT NULL,
	"provider_reference" varchar(120) NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"payout_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payout_requests_payout_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"method" "payout_method" NOT NULL,
	"status" "payout_status" DEFAULT 'Pending' NOT NULL,
	"reference" varchar(120),
	"admin_note" text,
	"reviewed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"setting_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_settings_setting_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"commission_rate_basis_points" integer DEFAULT 1000 NOT NULL,
	"commission_mode" "commission_mode" DEFAULT 'percent' NOT NULL,
	"flat_commission_amount" integer DEFAULT 0 NOT NULL,
	"vat_rate_basis_points" integer DEFAULT 2000 NOT NULL,
	"platform_name" varchar(180) DEFAULT 'ALTUSplace' NOT NULL,
	"contact_email" varchar(320),
	"contact_phone" varchar(40),
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"refund_request_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "refund_requests_refund_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_request_status" DEFAULT 'Pending' NOT NULL,
	"admin_note" text,
	"reviewed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"review_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reviews_review_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"ticket_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "support_tickets_ticket_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"category" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"status" "support_ticket_status" DEFAULT 'Open' NOT NULL,
	"last_response" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"translation_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "translations_translation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"listing_id" integer NOT NULL,
	"language" varchar(10) NOT NULL,
	"field" varchar(50) NOT NULL,
	"original_text" text NOT NULL,
	"translated_text" text NOT NULL,
	"provider" varchar(20) DEFAULT 'aws' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"whatsapp_phone" varchar(32),
	"commercial_register" varchar(120),
	"agency_name" varchar(180),
	"agency_logo_url" text,
	"agency_phone" varchar(32),
	"agency_email" varchar(320),
	"agency_address" varchar(255),
	"agency_website" varchar(255),
	"agency_latitude" varchar(32),
	"agency_longitude" varchar(32),
	"agency_hours" text,
	"loginMethod" varchar(64),
	"passwordHash" varchar(255),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"vendor_tier" "vendor_tier" DEFAULT 'bronze' NOT NULL,
	"stripe_account_id" varchar(120),
	"account_status" "account_status" DEFAULT 'active' NOT NULL,
	"kyc_verification_status" varchar(20) DEFAULT 'unverified' NOT NULL,
	"kyc_verified_at" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"legal_consent_version" varchar(80),
	"legal_consent_at" timestamp,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_messages_booking_created_idx" ON "booking_messages" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_messages_recipient_unread_idx" ON "booking_messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "bookings_listing_status_dates_idx" ON "bookings" USING btree ("listing_id","status","start_date","end_date");--> statement-breakpoint
CREATE INDEX "bookings_renter_id_idx" ON "bookings" USING btree ("renter_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputes_booking_id_idx" ON "disputes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "disputes_opened_by_idx" ON "disputes" USING btree ("opened_by");--> statement-breakpoint
CREATE INDEX "escrow_ledger_booking_idx" ON "escrow_ledger" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "escrow_ledger_vendor_status_idx" ON "escrow_ledger" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "invoices_booking_id_idx" ON "invoices" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "kyc_submissions_provider_session_idx" ON "kyc_submissions" USING btree ("provider_session_id");--> statement-breakpoint
CREATE INDEX "kyc_submissions_user_id_idx" ON "kyc_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listing_analytics_listing_event_idx" ON "listing_analytics_events" USING btree ("listing_id","event_type");--> statement-breakpoint
CREATE INDEX "listing_analytics_listing_created_idx" ON "listing_analytics_events" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_comments_listing_created_idx" ON "listing_comments" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_comments_author_idx" ON "listing_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "listings_city_idx" ON "listings" USING btree ("city");--> statement-breakpoint
CREATE INDEX "listings_category_idx" ON "listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "listings_price_per_day_idx" ON "listings" USING btree ("price_per_day");--> statement-breakpoint
CREATE INDEX "listings_status_idx" ON "listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "listings_owner_id_idx" ON "listings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "listings_search_composite_idx" ON "listings" USING btree ("city","category","status");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "payments_booking_id_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_payer_id_idx" ON "payments" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "payout_requests_owner_id_idx" ON "payout_requests" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "payout_requests_status_idx" ON "payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refund_requests_booking_idx" ON "refund_requests" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "refund_requests_requester_idx" ON "refund_requests" USING btree ("requested_by","status");--> statement-breakpoint
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_listing_language_field_idx" ON "translations" USING btree ("listing_id","language","field");--> statement-breakpoint
CREATE INDEX "translation_listing_language_idx" ON "translations" USING btree ("listing_id","language");--> statement-breakpoint
INSERT INTO "commission_tiers" ("tier", "mode", "percent_basis_points", "flat_amount") VALUES
	('bronze', 'percent', 1000, 0),
	('silver', 'percent', 800, 0),
	('gold', 'percent', 600, 0)
	ON CONFLICT ("tier") DO NOTHING;