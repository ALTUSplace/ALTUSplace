-- Reviews: add the missing per-listing lookup index and the rating range CHECK.
-- Also repairs drift left by an early manual demo-seed run: stray columns
-- (user_name / user_avatar) that never existed in drizzle/schema.ts, and 15
-- orphan rows (booking_id = 0) that refer to no real booking. Fake/orphan
-- reviews must never surface in production, so they are removed here.
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_listing_idx" ON "reviews" USING btree ("listing_id");
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);
--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "user_name";
--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "user_avatar";
--> statement-breakpoint
DELETE FROM "reviews" WHERE "booking_id" = 0;