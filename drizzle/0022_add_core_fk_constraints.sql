-- Referential integrity for the four core relations that had no foreign key at all.
--
-- Why NOT VALID then VALIDATE CONSTRAINT: ADD CONSTRAINT ... FOREIGN KEY takes
-- an ACCESS EXCLUSIVE lock on the referencing table for the duration of a full
-- validation scan, which blocks reads and writes for the length of that scan.
-- Adding the constraint NOT VALID skips the scan (it only takes a brief
-- SHARE ROW EXCLUSIVE), and the follow-up VALIDATE CONSTRAINT then performs the
-- scan under a weaker lock that permits normal traffic. Net effect: the
-- constraint is fully enforced for all new and updated rows the instant the
-- ADD lands, and proven against existing rows without a long stall.
--
-- The data was audited read-only immediately before this migration. All four
-- relations had zero orphaned rows, so each VALIDATE below succeeds:
--
--   listings.owner_id   -> users.id         0 orphans (10 listings, 35 users)
--   favorites.user_id   -> users.id         0 orphans (2 favorites)
--   favorites.listing_id-> listings.listing_id  0 orphans
--   reviews.booking_id  -> bookings.booking_id   0 orphans (0 bookings)
--
-- ON DELETE semantics are chosen per relation, not defaulted, because these
-- constraints are new and the default NO ACTION would break live flows:
--
--   favorites.user_id    ON DELETE CASCADE
--   favorites.listing_id ON DELETE CASCADE
--       A favorite is a pure join row with no meaning once either parent is
--       gone, and cascading preserves today's behaviour. This matters most for
--       favorites.listing_id: admin.deleteListing (server/routers.ts:1137) and
--       listings.remove (server/routers.ts:2220) both delete a listing without
--       touching related rows, so under NO ACTION any owner deleting a listing
--       somebody had favorited would get a foreign key violation instead of a
--       successful delete.
--
--   reviews.booking_id   ON DELETE CASCADE
--       A review is scoped to one booking; every existing cleanup path already
--       deletes reviews before their bookings, so this adds safety net without
--       changing any outcome.
--
--   listings.owner_id    ON DELETE RESTRICT
--       Deliberately NOT cascade: deleting a user must never silently destroy
--       that owner's live listings. All three user-deletion paths in the app
--       (routers.ts:866, :939, :968 and server/demoCleanup.ts:83) already remove
--       listings before users, so RESTRICT changes no current outcome while
--       preventing a new class of data loss.
--
-- reviews.listing_id -> listings.listing_id is intentionally NOT added here.
-- The same two listing-deletion paths do not clean up reviews, so that
-- constraint would need either ON DELETE CASCADE (which silently destroys review
-- history) or a rewrite of those two handlers to delete related rows in a
-- transaction. That decision is deferred rather than guessed at.

-- 1. listings.owner_id -> users.id
ALTER TABLE "listings"
  ADD CONSTRAINT "listings_owner_id_users_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE "listings"
  VALIDATE CONSTRAINT "listings_owner_id_users_id_fkey";

-- 2. favorites.user_id -> users.id
ALTER TABLE "favorites"
  ADD CONSTRAINT "favorites_user_id_users_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE CASCADE NOT VALID;

ALTER TABLE "favorites"
  VALIDATE CONSTRAINT "favorites_user_id_users_id_fkey";

-- 3. favorites.listing_id -> listings.listing_id
ALTER TABLE "favorites"
  ADD CONSTRAINT "favorites_listing_id_listings_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("listing_id")
  ON DELETE CASCADE NOT VALID;

ALTER TABLE "favorites"
  VALIDATE CONSTRAINT "favorites_listing_id_listings_listing_id_fkey";

-- 4. reviews.booking_id -> bookings.booking_id
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_booking_id_bookings_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("booking_id")
  ON DELETE CASCADE NOT VALID;

ALTER TABLE "reviews"
  VALIDATE CONSTRAINT "reviews_booking_id_bookings_booking_id_fkey";
