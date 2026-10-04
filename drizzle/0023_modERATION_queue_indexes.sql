-- Partial indexes backing admin.moderationQueue.
--
-- The moderation queue filters each of its four tables on the pending state and
-- orders by submission time. Three of those four tables could not serve that
-- filter at all before this migration:
--
--   listings          listings_status_idx ON (status)                 covered
--   kyc_submissions   no index on status at all                       seq scan
--   partner_applications  no index on the table at all               seq scan
--   refund_requests   (requested_by, status)                          unusable
--
-- refund_requests deserves a note: status IS in requesterIdx, but it is the
-- second column, and nothing constrains the first. Postgres cannot use a
-- composite index to answer a filter on a trailing column alone, so that index
-- served this query exactly as well as having no index on status at all.
--
-- These are PARTIAL indexes, not full ones, on purpose. The queue only ever
-- asks for pending rows, and in every one of these tables the settled rows
-- outnumber the pending ones once the product is running. A partial index stores
-- only the rows the query can actually reach, so it stays small and stays in
-- cache no matter how much history accumulates behind it. It also keeps the
-- index valid across status transitions: a row that leaves the pending set
-- simply stops being indexed, with no UPDATE to the index required.
--
-- CONCURRENTLY is deliberately NOT used. It cannot run inside a transaction
-- block, and the migration runner wraps each file in one. The tables are small
-- today (single-digit to low-hundreds of rows), so the brief ACCESS EXCLUSIVE
-- lock each CREATE INDEX takes is not worth the operational complexity of
-- splitting the migration into a separate non-transactional step. Revisit if any
-- of these tables grows large enough that the lock window becomes visible.
--
-- Matching declarations were added to drizzle/schema.ts. Without them the next
-- `drizzle-kit generate` would see three indexes in the database that the schema
-- does not describe, and emit DROP statements for all three.

CREATE INDEX IF NOT EXISTS "kyc_submissions_pending_status_idx"
  ON "kyc_submissions" ("status")
  WHERE "status" = 'Pending';

CREATE INDEX IF NOT EXISTS "partner_applications_pending_status_idx"
  ON "partner_applications" ("status")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "refund_requests_pending_status_idx"
  ON "refund_requests" ("status")
  WHERE "status" = 'Pending';
