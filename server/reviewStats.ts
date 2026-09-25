import { eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { reviews } from "../drizzle/schema";
import { DEFAULT_TTLS, cacheGet, cacheSet, getListingRatingBreakdownKey } from "./_core/cache";
import type { getDb } from "./db";

export type ReviewsDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Computed per-listing review aggregates. Average is rounded to one decimal in
 * SQL (browser/SQL rounding agree on half-up-away-from-zero for our range) and
 * the count is exact. These fragments are the single source of truth shared by
 * `reviews.summary`, the listings list/search/recommendations groupBy, and the
 * `listings.getById` passthrough.
 */
export const REVIEW_AVG_SQL: SQL<number> = sql`round(avg(${reviews.rating})::numeric, 1)::float8`;
export const REVIEW_COUNT_SQL: SQL<number> = sql`count(*)::int4`;

/** Rounds a raw average to one decimal, defensively (matches the SQL rounding). */
export function roundAverage(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

/** Normalizes a summary row into the public { average, count } shape. */
export function normalizeSummary(
  row?: { average?: number | null; count?: number | null } | null,
): { average: number; count: number } {
  return { average: roundAverage(row?.average), count: row?.count ?? 0 };
}

/** Runs the single-listing aggregate query and returns the normalized summary. */
export async function fetchListingReviewSummary(db: ReviewsDb, listingId: number) {
  const [row] = await db
    .select({ average: REVIEW_AVG_SQL, count: REVIEW_COUNT_SQL })
    .from(reviews)
    .where(eq(reviews.listingId, listingId))
    .limit(1);
  return normalizeSummary(row);
}

/**
 * Per-criterion averages for one listing, each the mean of the sub-scores
 * reviewers actually filled in.
 *
 * A criterion nobody rated stays `null` ("no data") instead of being coalesced
 * to 0: on a 1-5 scale a 0 would read as a terrible score rather than an
 * absent one, and the client hides null criteria rather than drawing a bar.
 * Only the count is COALESCEd, because "0 reviews" is a real, meaningful zero.
 */
export type RatingBreakdown = {
  avgCleanliness: number | null;
  avgLocation: number | null;
  avgValue: number | null;
  avgCommunication: number | null;
  avgAccuracy: number | null;
  totalReviews: number;
};

/**
 * Rounded mean of one sub-score column. `avg()` already ignores NULLs, so a
 * partially rated set of reviews still averages the real values; it yields NULL
 * only when the column is NULL for every row (or there are no rows at all).
 */
const criterionAvgSql = (column: PgColumn): SQL<number | null> =>
  sql`round(avg(${column})::numeric, 1)::float8`;

/** Defensive coercion of one aggregated average (SQL NULL / NaN -> null). */
function normalizeCriterion(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = roundAverage(value);
  return rounded > 0 ? rounded : null;
}

/** Normalizes one aggregate row into the public, null-safe breakdown shape. */
export function normalizeBreakdown(row?: Partial<RatingBreakdown> | null): RatingBreakdown {
  const count = row?.totalReviews;
  return {
    avgCleanliness: normalizeCriterion(row?.avgCleanliness),
    avgLocation: normalizeCriterion(row?.avgLocation),
    avgValue: normalizeCriterion(row?.avgValue),
    avgCommunication: normalizeCriterion(row?.avgCommunication),
    avgAccuracy: normalizeCriterion(row?.avgAccuracy),
    totalReviews: typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
  };
}

/**
 * Cache-aside read of a listing's criterion breakdown, keyed per listing id and
 * held for 5 minutes. The aggregate is a single indexed scan over that listing's
 * own review rows, so the cache is an optimization (it keeps a hot listing's
 * detail page from re-aggregating on every hit) and not a correctness
 * requirement — a 5-minute staleness window on a review average is acceptable,
 * and it keeps `reviews.create` free of an invalidation path.
 */
export async function fetchListingRatingBreakdown(db: ReviewsDb, listingId: number): Promise<RatingBreakdown> {
  const cacheKey = getListingRatingBreakdownKey(listingId);
  const cached = await cacheGet<RatingBreakdown>(cacheKey);
  if (cached) return normalizeBreakdown(cached);

  const [row] = await db
    .select({
      avgCleanliness: criterionAvgSql(reviews.cleanlinessScore),
      avgLocation: criterionAvgSql(reviews.locationScore),
      avgValue: criterionAvgSql(reviews.valueScore),
      avgCommunication: criterionAvgSql(reviews.communicationScore),
      avgAccuracy: criterionAvgSql(reviews.accuracyScore),
      totalReviews: sql<number>`coalesce(count(*)::int4, 0)`,
    })
    .from(reviews)
    .where(eq(reviews.listingId, listingId))
    .limit(1);

  const breakdown = normalizeBreakdown(row);
  await cacheSet(cacheKey, breakdown, DEFAULT_TTLS.RATING_BREAKDOWN);
  return breakdown;
}