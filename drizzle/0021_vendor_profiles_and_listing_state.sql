-- Vendor profiles, plus listing currency / watermark / slug state.
--
-- Hand-written and strictly additive, per the 0013-0020 convention. The 0019
-- pair from `drizzle-kit generate` was a full catalog diff against a stale
-- snapshot and re-applied everything 0013-0020 already does (favorites,
-- reviews sub-scores, users.whatsapp_number, partner_applications.vehicles).
-- Replaying those fails on an already-migrated database, so only the objects no
-- committed migration creates are kept here.
--
-- Objects added, and why each is safe on a populated database:
--   vendor_profiles          new table, created empty
--   vendor_profiles FK       the table was just created and holds no rows, so
--                            there is nothing to validate against users(id)
--   ..._user_id_unique_idx   one profile per user, so an upsert is a single
--                            ON CONFLICT (user_id)
--   audit_logs.notes         nullable, no backfill: free-text moderation
--                            reason for the admin audit feed
--   listings.currency        NOT NULL with a DEFAULT, so existing rows stay
--                            valid (PG11+ fast default, no table rewrite)
--   listings.watermark_applied
--                            same reasoning: DEFAULT false makes every
--                            pre-existing listing valid
--   listings.city_slug       nullable on purpose; backfilled separately from
--                            the Arabic city values
--   listings_owner_status_category_idx
--                            moderation + vendor dashboard: one owner's queue,
--                            filtered by type
--
-- The rationale lives in this one header block on purpose. applyMigration
-- (migrate.mjs:136-202) classifies each statement with a `^`-anchored regex and
-- has no leading-comment tolerance, so a comment placed above a statement makes
-- it fall through to the bare `tx.unsafe(statement)` fallback and lose its
-- existence guard.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL,
  "business_name" varchar(180) NOT NULL,
  "logo_url" text,
  "is_verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_profiles_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_profiles_user_id_unique_idx" ON "vendor_profiles" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "notes" text;
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "currency" varchar(3) DEFAULT 'MAD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "watermark_applied" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "city_slug" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_owner_status_category_idx" ON "listings" USING btree ("owner_id","status","category");
