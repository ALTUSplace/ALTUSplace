-- ============================================================================
-- cleanup-demo-data.sql
-- ----------------------------------------------------------------------------
-- MANUAL, ONE-OFF purge of seeded demo data (the two demo accounts and their
-- listings/bookings) from a real database.
--
-- This mirrors the authoritative deletion order in `server/cron/demoCleanup.ts`
-- (payments -> booking_messages -> booking_vouchers -> escrow_ledger ->
-- refund_requests -> commercial_lease_contracts -> reviews -> invoices ->
-- listing_comments -> listing_analytics_events -> bookings -> listings ->
-- users), but WITHOUT the cron's 30-day retention cutoff: this is a full wipe
-- of every demo row, intended to run once before go-live.
--
-- Scope IDs (must match demoCleanup.ts):
--   DEMO_OWNER_OPENID  = 'demo-owner-altusplace'
--   DEMO_AGENCY_OPENID = 'demo-owner-id'
--
-- Notes:
--   * `favorites` is intentionally omitted: both of its FKs cascade, so its
--     rows disappear with the listings/users deletes.
--   * `transactions`, notifications and audit logs are intentionally NOT
--     touched (matching the cron).
--   * Quote `"openId"` and `"createdAt"`: those columns are camelCase in the DB.
--
-- HOW TO RUN
--   1. Take a database backup / branch first.
--   2. Run STEP 1 (read-only) and confirm the row counts look right.
--   3. Uncomment the `COMMIT;` at the bottom of STEP 2 and run it.
--   4. Re-run STEP 1: every count must now be 0.
--
-- Running STEP 2 as-is is SAFE: it rolls back at the end and changes nothing.
-- ============================================================================


-- ============================================================================
-- STEP 1 - DRY RUN (read-only counts). Expect non-zero before the purge and 0
-- afterwards.
-- ============================================================================

SELECT 'users (demo owners)' AS entity, count(*) AS rows
FROM users
WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id');

SELECT 'listings' AS entity, count(*) AS rows
FROM listings
WHERE owner_id IN (
    SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id')
  )
  OR title LIKE '%رينو كليو%';

SELECT 'bookings' AS entity, count(*) AS rows
FROM bookings
WHERE listing_id IN (
    SELECT listing_id FROM listings
    WHERE owner_id IN (
      SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id')
    )
    OR title LIKE '%رينو كليو%'
  )
  OR secondary_listing_id IN (
    SELECT listing_id FROM listings
    WHERE owner_id IN (
      SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id')
    )
    OR title LIKE '%رينو كليو%'
  );

SELECT 'payments' AS entity, count(*) AS rows
FROM payments
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'booking_messages' AS entity, count(*) AS rows
FROM booking_messages
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'booking_vouchers' AS entity, count(*) AS rows
FROM booking_vouchers
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'escrow_ledger' AS entity, count(*) AS rows
FROM escrow_ledger
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'refund_requests' AS entity, count(*) AS rows
FROM refund_requests
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'commercial_lease_contracts' AS entity, count(*) AS rows
FROM commercial_lease_contracts
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'reviews' AS entity, count(*) AS rows
FROM reviews
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  )
  OR listing_id IN (
    SELECT listing_id FROM listings
    WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
       OR title LIKE '%رينو كليو%'
  );

SELECT 'invoices' AS entity, count(*) AS rows
FROM invoices
WHERE booking_id IN (
    SELECT booking_id FROM bookings
    WHERE listing_id IN (
      SELECT listing_id FROM listings
      WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
         OR title LIKE '%رينو كليو%'
    )
  );

SELECT 'listing_comments' AS entity, count(*) AS rows
FROM listing_comments
WHERE listing_id IN (
    SELECT listing_id FROM listings
    WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
       OR title LIKE '%رينو كليو%'
  );

SELECT 'listing_analytics_events' AS entity, count(*) AS rows
FROM listing_analytics_events
WHERE listing_id IN (
    SELECT listing_id FROM listings
    WHERE owner_id IN (SELECT id FROM users WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id'))
       OR title LIKE '%رينو كليو%'
  );


-- ============================================================================
-- STEP 2 - PURGE (child-first). Runs in a transaction and ROLLS BACK unless you
-- uncomment the COMMIT.
-- ============================================================================

BEGIN;

-- Resolve the demo id sets once into temp tables.
CREATE TEMP TABLE _demo_owner_ids ON COMMIT DROP AS
  SELECT id FROM users
  WHERE "openId" IN ('demo-owner-altusplace', 'demo-owner-id');

CREATE TEMP TABLE _demo_listing_ids ON COMMIT DROP AS
  SELECT listing_id FROM listings
  WHERE owner_id IN (SELECT id FROM _demo_owner_ids)
     OR title LIKE '%رينو كليو%';

CREATE TEMP TABLE _demo_booking_ids ON COMMIT DROP AS
  SELECT booking_id FROM bookings
  WHERE listing_id IN (SELECT listing_id FROM _demo_listing_ids)
     OR secondary_listing_id IN (SELECT listing_id FROM _demo_listing_ids);

-- 1. payments
DELETE FROM payments
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 2. booking_messages
DELETE FROM booking_messages
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 3. booking_vouchers
DELETE FROM booking_vouchers
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 4. escrow_ledger
DELETE FROM escrow_ledger
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 5. refund_requests
DELETE FROM refund_requests
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 6. commercial_lease_contracts
DELETE FROM commercial_lease_contracts
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 7. reviews (by booking OR listing)
DELETE FROM reviews
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids)
   OR listing_id IN (SELECT listing_id FROM _demo_listing_ids);

-- 8. invoices
DELETE FROM invoices
WHERE booking_id IN (SELECT booking_id FROM _demo_booking_ids);

-- 9. listing_comments
DELETE FROM listing_comments
WHERE listing_id IN (SELECT listing_id FROM _demo_listing_ids);

-- 10. listing_analytics_events
DELETE FROM listing_analytics_events
WHERE listing_id IN (SELECT listing_id FROM _demo_listing_ids);

-- 11. bookings (by primary OR secondary listing)
DELETE FROM bookings
WHERE listing_id IN (SELECT listing_id FROM _demo_listing_ids)
   OR secondary_listing_id IN (SELECT listing_id FROM _demo_listing_ids);

-- 12. listings
DELETE FROM listings
WHERE listing_id IN (SELECT listing_id FROM _demo_listing_ids);

-- 13. users (last, after their listings are gone)
DELETE FROM users
WHERE id IN (SELECT id FROM _demo_owner_ids);

-- SAFE DEFAULT: leave the transaction uncommitted so a casual run changes
-- nothing. Uncomment COMMIT (and remove ROLLBACK) to actually purge.
-- COMMIT;
ROLLBACK;
