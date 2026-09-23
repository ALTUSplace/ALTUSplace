CREATE TABLE IF NOT EXISTS "favorites" (
  "favorite_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL,
  "listing_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "favorites_favorite_id_pk" PRIMARY KEY("favorite_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorites_user_idx" ON "favorites" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorites_listing_idx" ON "favorites" USING btree ("listing_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "favorites_user_listing_unique_idx" ON "favorites" USING btree ("user_id","listing_id");
