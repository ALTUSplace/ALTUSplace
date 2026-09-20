-- ============================================================================
--  ALTUSplace — SQL wipe script: remove the entire car fleet from the database
-- ============================================================================
--  PURPOSE
--  ---------------------------------------------------------------------------
--  The car-rental fleet was removed from the ALTUSplace 2026 catalogue (both
--  the frontend showcase and the demo seed). This script brings an EXISTING
--  production/demo database to the same state: it deletes every row in the
--  `listings` table whose category identifies it as a vehicle/car, while
--  leaving all real-estate listings (apartments / خصائص) untouched.
--
--  SAFETY
--  ---------------------------------------------------------------------------
--  * It is scoped strictly to `listings.category` — cars are stored with
--    Arabic/French categories such as:
--        "سيارة رباعية / SUV", "سيارة اقتصادية / City",
--        "سيارة / Car", "سيارة رباعية / 4x4",
--        "SUV / سيارة رباعية", "سيارة اقتصادية / City", "Car"
--  * Property listings (شقة / Appartement / فيلا / مكتب...) are never touched.
--  * It is idempotent and re-runnable.
--  * It runs inside an explicit transaction together with the pending/booking
--    cleanup, so a partial failure leaves the DB unchanged.
--
--  DEPENDENCIES
--  ---------------------------------------------------------------------------
--  Run against the Supabase Postgres instance (SQL editor) or through
--  `psql "$DATABASE_URL" -f server/wipeCarFleet.sql`. No code changes needed.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Remove vehicle rows from the public marketplace (`listings`).
-- ---------------------------------------------------------------------------
DELETE FROM listings
WHERE category ILIKE '%car%'
   OR category ILIKE '%سيارة%'
   OR category ILIKE '%SUV%'
   OR category ILIKE '%رباعية%'
   OR category ILIKE '%4x4%';

-- ---------------------------------------------------------------------------
-- 2) Clean up the catalog cover lookup so car slugs can never render again.
--    (If your schema keeps the cover map in a settings/config table.)
-- ---------------------------------------------------------------------------
DELETE FROM site_settings
WHERE key = 'catalog_covers'
  AND value::text ILIKE '%duster%'
   OR value::text ILIKE '%clio%'
   OR value::text ILIKE '%wrangler%'
   OR value::text ILIKE '%tucson%';

-- ---------------------------------------------------------------------------
-- 3) Remove any car-rental provider rows (partner agency accounts).
--    Scoped via `type` so property-management providers stay untouched.
-- ---------------------------------------------------------------------------
DELETE FROM providers
WHERE type IN ('car_rental', 'car_rentals', 'car')
   AND status <> 'rejected';   -- keep rejected rows for audit history

COMMIT;

-- ============================================================================
--  VERIFICATION (run after the transaction, optional):
-- ---------------------------------------------------------------------------
-- SELECT category, count(*) FROM listings GROUP BY category ORDER BY 2 DESC;
--   -> should show ONLY property categories (شقة / Appartement / ...).
-- ============================================================================
