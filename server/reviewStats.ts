import { eq, sql, type SQL } from "drizzle-orm";
import { reviews } from "../drizzle/schema";
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