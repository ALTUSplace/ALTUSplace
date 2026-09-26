# Incident: listing detail pages return 500 (reviews sub-score schema drift)

- **Severity:** P0 production. Every listing detail page is unusable.
- **Detected:** 2026-09-26, during the post-merge visual sweep of PR #6.
- **Status at time of writing:** root-caused, fix prepared, **not yet applied to production**.
- **Main at diagnosis:** `028f1fb385cd8f6246e1b0d9faa057955e5911f5`

## 1. Symptom

| Request | Result |
| --- | --- |
| `/property/31`, `/property/32`, `/property/33`, `/property/34` | HTTP **500** from `listings.getById`; page hangs on `جاري التحميل...` ("Loading...") forever |
| `/car/25`, `/car/30` | HTTP **500** from `listings.getById` |
| `/property/999999` (nonexistent id) | **200**, renders the clean not-found state `تعذر تحميل الإعلانات` |

The nonexistent-id case is the discriminating evidence: the failure is *not* in the
listing lookup, it is in code that only runs once a row has been found.

## 2. Root cause

`drizzle/0020_detailed_ratings.sql` was committed to the repository but **never
registered in `drizzle/meta/_journal.json`**.

Both migration runners in this project are journal-driven, not directory-glob-driven:

- `scripts/migrate.mjs` iterates `journal.entries` and reads
  `` `${entry.tag}.sql` `` (`scripts/migrate.mjs`, `readMigrationFile`).
- `drizzle-kit migrate` is likewise driven by the journal.

The journal's last entry is `idx 17` / `0017_add_agency_whatsapp_number`. The `0020`
entry is absent, so **the file has never been read by any migration runner and
`pnpm db:migrate` still would not apply it.** This is stronger than "migration exists
but was not run" — the migration was structurally unappliable.

The omission dates to `0d00a0b feat: add multi-criteria rating system`, which added
`drizzle/0020_detailed_ratings.sql` and the matching `drizzle/schema.ts` columns in the
same commit, but did not touch `drizzle/meta/_journal.json`.

`server/reviews.test.ts` asserts the *contents* of `0020_detailed_ratings.sql`, so the
file was reviewed. Nothing asserted that it was *reachable*, which is why the omission
survived.

## 3. Predicted runtime error

```
column "cleanliness_score" does not exist
```

PostgreSQL SQLSTATE **42703** (`undefined_column`), raised from
`fetchListingRatingBreakdown` at `server/reviewStats.ts:101-112` and surfaced by tRPC as
HTTP 500.

This is a **prediction from the schema diff**, not an observed trace. At the time of
writing no Vercel function log had been supplied. If the real trace names a different
table or column, this diagnosis is wrong and must be redone before the fix is applied.

## 4. Why exactly these pages fail

`listings.getById` calls two review helpers in sequence:

1. `server/routers.ts:1905` → `fetchListingReviewSummary` selects only `rating` and
   filters on `listing_id`. Both columns have existed since `0000_soft_skreet.sql`, so
   **this call succeeds**.
2. `server/routers.ts:1909` → `fetchListingRatingBreakdown` selects all five
   sub-score columns (`server/reviewStats.ts:103-107`). None exist in production, so
   **this call throws**.
3. For a nonexistent id, `if (!result[0]) return null` returns before either helper is
   reached, which is why `/property/999999` renders cleanly.

`fetchListingRatingBreakdown` is cached for 5 minutes
(`DEFAULT_TTLS.RATING_BREAKDOWN`), but the cache is consulted *before* the query
(`server/reviewStats.ts:98-99`), so a cold or expired key always reaches the failing
query. The cache reduces repeat failures; it does not prevent them.

## 5. Affected code paths

| Path | Operation | Status |
| --- | --- | --- |
| `server/reviewStats.ts:101-112` (`fetchListingRatingBreakdown`) | `SELECT` the 5 sub-score columns | **broken — causes the reported 500** |
| `server/routers.ts:3382-3386` (`reviews.create`) | `INSERT` the 5 sub-score columns | **also broken — submitting a review would 500 and lose the user's input** |

The insert path is not covered by the reported symptom (the incident was found by
browsing), but it fails for the same reason and is the more damaging of the two,
because it discards data a user submitted. Confirming it is part of the verification
step, not an assumption.

Unaffected, because they only reference columns that exist:

- `server/reviewStats.ts:33-40` (`fetchListingReviewSummary`) — `rating`, `listing_id`.
- `fetchListingRatingBreakdown`'s cache-hit path (`server/reviewStats.ts:98-99`).

## 6. Schema: expected vs. actual in production

The `reviews` table **does** exist, created by `0000_soft_skreet.sql` (journal idx 0).

| Column / object | Source | In production |
| --- | --- | --- |
| `review_id`, `booking_id`, `listing_id`, `user_id`, `rating`, `comment`, `createdAt` | `0000` (idx 0) | yes |
| index `reviews_listing_idx`, check `reviews_rating_check` | `0015` (idx 15) | yes |
| `is_verified` boolean NOT NULL DEFAULT true | `0016` (idx 16) | yes |
| `cleanliness_score` smallint | `0020` (**unregistered**) | **NO** |
| `location_score` smallint | `0020` (**unregistered**) | **NO** |
| `value_score` smallint | `0020` (**unregistered**) | **NO** |
| `communication_score` smallint | `0020` (**unregistered**) | **NO** |
| `accuracy_score` smallint | `0020` (**unregistered**) | **NO** |
| check `reviews_scores_check` | `0020` (**unregistered**) | **NO** |

## 7. The fix

Register the existing migration in the journal. One entry, appended at `idx 18`:

```json
{
  "idx": 18,
  "version": "7",
  "when": 1791300000000,
  "tag": "0020_detailed_ratings",
  "breakpoints": true
}
```

The file is **not** renamed. Two reasons:

- `server/reviews.test.ts:478` pins the literal path
  `drizzle/0020_detailed_ratings.sql`.
- `scripts/migrate.mjs` resolves `` `${entry.tag}.sql` ``, so the tag must equal the
  existing filename or the runner throws `ENOENT`.

The `0018`/`0019` numbering gap is cosmetic. `drizzle-kit` orders by array position
and `scripts/migrate.mjs` iterates the array in order; the `idx` field, not the numeric
prefix, determines sequence.

## 8. Production runbook

**This migration is applied by a human, manually. Do not run it from the detached-HEAD
working tree (`C:\Users\kml\Documents\Default Project`) — it contains uncommitted
watermark work and is 9 commits behind `main`. Run it from the incident worktree only.**

### Step 0 — snapshot the database first

Take a backup/snapshot of the production database **before** touching it. Do not skip
this step; the `ALTER TABLE ... ADD CONSTRAINT` at the end validates every existing row
and will fail on any pre-existing out-of-range value, so there is a real (if small)
chance of needing to roll back.

### Step 1 — confirm you are in the right place

```bash
cd "C:/Users/kml/Documents/altus-incident"
git fetch origin
git checkout main
git pull --ff-only origin main
git log --oneline -1        # must be the merge commit of the journal-fix PR
```

Verify the journal entry is present on `main` before continuing:

```bash
node -e "const j=require('./drizzle/meta/_journal.json');console.log(j.entries.at(-1))"
# expect: { idx: 18, ..., tag: '0020_detailed_ratings' }
```

### Step 2 — supply the production connection string

There is no `.env` in the worktree and `DATABASE_URL` is not set in the shell. The
runner reads `DATABASE_URL`, then `SUPABASE_DB_URL`, then `.env`. Set it explicitly for
this shell only — do not write it into a tracked file:

```bash
export DATABASE_URL='<production-connection-string>'
```

Confirm you are pointed at production and not a copy before continuing. A mistaken
target here is the difference between a fix and a second incident.

### Step 3 — inspect current state (read-only, safe)

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='reviews'
ORDER BY ordinal_position;
```

Expect `review_id, booking_id, listing_id, user_id, rating, comment, is_verified,
createdAt`. The five `*_score` columns should be **absent** — that is the confirmation
this runbook is being followed for the right reason.

### Step 4 — install dependencies, then run the migration

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
```

`pnpm db:migrate` runs `node scripts/migrate.mjs`, which is idempotent by content hash
and by per-object existence checks: it skips any column, index, table or constraint that
already exists. Re-running it is safe. Expected output ends with:

```
migrations applied/recorded: 19/19
```

Watch for these lines, which confirm each object was created rather than skipped:

```
- column reviews.cleanliness_score added
- column reviews.location_score added
- column reviews.value_score added
- column reviews.communication_score added
- column reviews.accuracy_score added
- constraint reviews_scores_check added on reviews
```

### Step 5 — smoke check by re-running the failing queries

The queries that were failing, verbatim:

```sql
-- fetchListingReviewSummary  (server/reviewStats.ts:33-40)
SELECT round(avg(rating)::numeric, 1)::float8 AS average, count(*)::int4 AS count
FROM reviews WHERE listing_id = 31 LIMIT 1;

-- fetchListingRatingBreakdown  (server/reviewStats.ts:101-112) -- this one was throwing
SELECT
  round(avg(cleanliness_score)::numeric, 1)::float8    AS avgCleanliness,
  round(avg(location_score)::numeric, 1)::float8      AS avgLocation,
  round(avg(value_score)::numeric, 1)::float8         AS avgValue,
  round(avg(communication_score)::numeric, 1)::float8 AS avgCommunication,
  round(avg(accuracy_score)::numeric, 1)::float8      AS avgAccuracy,
  coalesce(count(*)::int4, 0)                        AS totalReviews
FROM reviews WHERE listing_id = 31 LIMIT 1;
```

The second query is the one that raised `42703`. It must now return one row with five
nullable averages (all `NULL` is correct and expected — existing reviews predate the
sub-scores) and a non-null `totalReviews`.

### Step 6 — verify the constraint actually validated

```sql
SELECT conname FROM pg_constraint
WHERE conrelid='reviews'::regclass AND conname='reviews_scores_check';
```

One row expected. Then confirm the runner recorded the migration:

```sql
SELECT count(*) FROM "drizzle"."__drizzle_migrations";
-- expect 19
```

### Step 7 — confirm in the application

- `/property/31` and `/property/32` return 200 and render listing detail content.
- `/car/25` and `/car/30` return 200.
- `/property/999999` still returns the clean not-found state (the migration must not
  have changed the early-return path).
- Submit **one** review through the live UI and confirm it persists and renders. This
  exercises the `reviews.create` insert path at `server/routers.ts:3382-3386`, which is
  broken independently of the read path and is not covered by the read smoke check.
  Delete the test review afterwards.

### If something fails

The migration is additive and nullable, so a partial application is survivable: the
columns are independent `ALTER TABLE ... ADD COLUMN` statements and a re-run skips
whatever already exists. Do **not** drop columns to "clean up" — restore from the
Step 0 snapshot instead. The `reviews_scores_check` constraint is the only statement
that can fail on existing data; if it does, the out-of-range rows are the finding, and
they should be corrected deliberately rather than by dropping the constraint.

## 9. Why the `gates` check did not catch this

Worth stating plainly, because it is the reason the incident reached production:

- `server/reviews.test.ts` and `server/listings.ratingBreakdown.integration.test.ts`
  both use an in-memory fake (`makeFakeDb(store)`) built from the drizzle schema
  objects. **No test in this repository connects to a real database.** The fake is
  derived from the same `drizzle/schema.ts` that declares the columns, so it is
  definitionally consistent with the code under test and structurally blind to the
  database.
- Neither CI nor the Vercel build runs migrations. `vercel.json`'s `buildCommand` is
  `pnpm install && pnpm build`, and no workflow invokes `db:migrate`. Production schema
  therefore only ever changes when a human runs the migration by hand.

Consequently there is currently **no automated check anywhere** that would catch an
unapplied migration. Follow-up work to close that gap is tracked separately; see
section 10.

## 10. Follow-ups (not part of this fix)

1. **Add migrations to the deploy pipeline**, or add an explicit post-deploy schema
   verification step, so an unregistered migration cannot silently reach production
   again. Ideally also a CI check asserting that every `drizzle/*.sql` file has a
   corresponding `_journal.json` entry — that single check would have caught this
   incident at `0d00a0b`.
2. **Evaluate a real-database integration test in CI.** The current fake-DB approach
   cannot detect schema drift by construction.
3. **No runtime guard is included, deliberately.** A `try/catch` around the review
   queries would restore page rendering without fixing the schema, and would mask the
   next unapplied migration in exactly the same way this one was masked. The migration
   is the fix. If defence-in-depth is wanted later, it should be added *after* the
   pipeline gap in (1) is closed, so that it can never be the thing hiding a drift.
