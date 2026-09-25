import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import { getListingRatingBreakdownKey } from "./_core/cache";
import { normalizeBreakdown } from "./reviewStats";
import { listings as listingsTable, reviews as reviewsTable } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type FacReview = {
  id: number;
  listingId: number;
  rating: number;
  cleanlinessScore?: number | null;
  locationScore?: number | null;
  valueScore?: number | null;
  communicationScore?: number | null;
  accuracyScore?: number | null;
};

type FacListing = {
  id: number;
  ownerId: number;
  title: string;
  category: string;
  pricePerDay: number;
  status: string;
  ownerName: string | null;
  ownerRole: string | null;
};

const listingA: FacListing = {
  id: 501,
  ownerId: 301,
  title: "Dacia Duster",
  category: "car",
  pricePerDay: 400,
  status: "Published",
  ownerName: "Agence Atlas",
  ownerRole: "partner",
};

const listingB: FacListing = { ...listingA, id: 502, title: "شقة فاخرة", category: "real_estate" };

/** Mean of the non-null values of one sub-score column, 1 decimal, or null. */
function criterionMean(rows: FacReview[], key: keyof FacReview): number | null {
  const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/**
 * Minimal drizzle fake for `listings.getById`: the listing+users join, the
 * review summary aggregate and the criterion-breakdown aggregate. Both review
 * aggregates read the same seeded rows, so the assertion below is about the real
 * SQL shape (AVG over the seeded sub-scores), not about a stubbed answer.
 */
function makeFakeDb(state: { listings: FacListing[]; reviews: FacReview[] }) {
  const thenable = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });

  const collectValues = (node: unknown, out: unknown[] = []): unknown[] => {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray((node as { queryChunks?: unknown[] }).queryChunks)) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) collectValues(chunk, out);
      return out;
    }
    const value = (node as { value?: unknown }).value;
    if ("value" in node && (typeof value !== "object" || value === null)) out.push(value);
    else if ("value" in node && typeof value === "object" && value !== null) collectValues(value, out);
    return out;
  };

  const reviewsFor = (listingId: number) => state.reviews.filter((row) => row.listingId === listingId);

  return {
    select: (shape: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === listingsTable) {
          if ("listing" in shape) {
            return {
              leftJoin: () => ({
                where: (condition: unknown) => ({
                  limit: () => {
                    const id = collectValues(condition)[0] as number;
                    const listing = state.listings.find((row) => row.id === id);
                    return thenable(
                      listing
                        ? [{ listing, ownerName: listing.ownerName, ownerRole: listing.ownerRole, agencyName: null, agencyPhone: null, whatsappPhone: null, whatsappNumber: null }]
                        : [],
                    );
                  },
                }),
              }),
            };
          }
          return { where: () => ({ limit: () => thenable([]) }) };
        }
        if (table === reviewsTable) {
          const listingIdFrom = (condition: unknown) => collectValues(condition)[0] as number;
          if ("totalReviews" in shape) {
            // criterion breakdown aggregate
            return {
              where: (condition: unknown) => ({
                limit: () => {
                  const rows = reviewsFor(listingIdFrom(condition));
                  return thenable([
                    {
                      avgCleanliness: criterionMean(rows, "cleanlinessScore"),
                      avgLocation: criterionMean(rows, "locationScore"),
                      avgValue: criterionMean(rows, "valueScore"),
                      avgCommunication: criterionMean(rows, "communicationScore"),
                      avgAccuracy: criterionMean(rows, "accuracyScore"),
                      totalReviews: rows.length,
                    },
                  ]);
                },
              }),
            };
          }
          if ("average" in shape) {
            // review summary aggregate
            return {
              where: (condition: unknown) => ({
                limit: () => {
                  const rows = reviewsFor(listingIdFrom(condition));
                  const average = rows.length
                    ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10
                    : null;
                  return thenable([{ average, count: rows.length }]);
                },
              }),
            };
          }
          throw new Error("rating breakdown test fake: unhandled reviews select shape");
        }
        throw new Error("rating breakdown test fake: unhandled select table");
      },
    }),
  };
}

function seed(): { listings: FacListing[]; reviews: FacReview[] } {
  return {
    listings: [listingA, listingB],
    reviews: [
      // Listing 501: three reviews with known sub-scores.
      { id: 1, listingId: 501, rating: 5, cleanlinessScore: 5, locationScore: 4, valueScore: 4, communicationScore: 5, accuracyScore: 4 },
      { id: 2, listingId: 501, rating: 4, cleanlinessScore: 4, locationScore: 5, valueScore: 3, communicationScore: 4, accuracyScore: 5 },
      { id: 3, listingId: 501, rating: 4, cleanlinessScore: 3, locationScore: null, valueScore: 4, communicationScore: 5, accuracyScore: 3 },
      // Listing 502: legacy reviews written before the 0020 sub-score columns existed.
      { id: 4, listingId: 502, rating: 5 },
      { id: 5, listingId: 502, rating: 4 },
      { id: 6, listingId: 502, rating: 4 },
    ],
  };
}

let state: { listings: FacListing[]; reviews: FacReview[] };

beforeEach(() => {
  state = seed();
  vi.mocked(getDb).mockResolvedValue(makeFakeDb(state) as unknown as Awaited<ReturnType<typeof getDb>>);
});

const caller = () => appRouter.createCaller({
  user: null,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => {} } as TrpcContext["res"],
});

describe("listings.getById — ratingBreakdown aggregation", () => {
  it("averages each criterion over the reviews that actually rated it", async () => {
    const detail = await caller().listings.getById({ id: 501 });
    expect(detail).not.toBeNull();
    // cleanliness (5,4,3) -> 4; location (4,5) -> 4.5 — review 3 left it blank;
    // value (4,3,4) -> 3.7; communication (5,4,5) -> 4.7; accuracy (4,5,3) -> 4.
    expect(detail!.ratingBreakdown).toEqual({
      avgCleanliness: 4,
      avgLocation: 4.5,
      avgValue: 3.7,
      avgCommunication: 4.7,
      avgAccuracy: 4,
      totalReviews: 3,
    });
  });

  it("never coerces an unrated criterion to a 0 score", async () => {
    const detail = await caller().listings.getById({ id: 501 });
    // Review 3 has no location sub-score; the mean still uses the two real ones.
    expect(detail!.ratingBreakdown.avgLocation).not.toBe(0);
    // Listing 502 has no sub-scores at all -> every criterion is null, not 0.
    const legacy = await caller().listings.getById({ id: 502 });
    expect(legacy!.ratingBreakdown).toEqual({
      avgCleanliness: null,
      avgLocation: null,
      avgValue: null,
      avgCommunication: null,
      avgAccuracy: null,
      totalReviews: 3,
    });
  });

  it("keeps the existing review aggregates intact next to the new breakdown", async () => {
    const detail = await caller().listings.getById({ id: 501 });
    expect(detail!.averageRating).toBe(4.3);
    expect(detail!.reviewCount).toBe(3);
    expect(detail!.id).toBe(501);
  });

  it("carries the breakdown through the translated response path too", async () => {
    const detail = await caller().listings.getById({ id: 501, language: "fr" });
    expect(detail!.ratingBreakdown.avgCleanliness).toBe(4);
    expect(detail!.ratingBreakdown.totalReviews).toBe(3);
  });

  it("reports an empty breakdown for a listing with no reviews", async () => {
    state.listings.push({ ...listingA, id: 503 });
    const detail = await caller().listings.getById({ id: 503 });
    expect(detail!.ratingBreakdown.totalReviews).toBe(0);
    expect(detail!.ratingBreakdown.avgCleanliness).toBeNull();
  });
});

describe("ratingBreakdown — SQL, cache key and normalization", () => {
  const source = readFileSync(resolve(process.cwd(), "server/reviewStats.ts"), "utf8");

  it("aggregates with AVG() and only coalesces the count", () => {
    for (const column of ["cleanlinessScore", "locationScore", "valueScore", "communicationScore", "accuracyScore"]) {
      expect(source).toContain(`criterionAvgSql(reviews.${column})`);
    }
    expect(source).toMatch(/round\(avg\(\$\{column\}\)::numeric, 1\)::float8/);
    expect(source).toContain("coalesce(count(*)::int4, 0)");
    // No materialized avg_* breakdown columns, and no AVG coalesced to 0.
    expect(source).not.toMatch(/avg_(cleanliness|location|value|communication|accuracy)/i);
    expect(source).not.toMatch(/coalesce\(\s*round\(avg/);
  });

  it("reads and writes one cache entry per listing for 5 minutes", async () => {
    expect(getListingRatingBreakdownKey(501)).toBe("listings:rating-breakdown:501");
    const cacheSource = readFileSync(resolve(process.cwd(), "server/_core/cache.ts"), "utf8");
    expect(cacheSource).toMatch(/RATING_BREAKDOWN: 300/);
    expect(source).toContain("cacheGet<RatingBreakdown>(cacheKey)");
    expect(source).toContain("cacheSet(cacheKey, breakdown, DEFAULT_TTLS.RATING_BREAKDOWN)");
    // The breakdown key is distinct from the listing-detail key.
    expect(getListingRatingBreakdownKey(501)).not.toBe("listings:detail:501");
  });

  it("normalizes NULL / non-finite aggregates into the null-safe shape", () => {
    expect(normalizeBreakdown(undefined)).toEqual({
      avgCleanliness: null,
      avgLocation: null,
      avgValue: null,
      avgCommunication: null,
      avgAccuracy: null,
      totalReviews: 0,
    });
    expect(normalizeBreakdown({ avgValue: Number.NaN, totalReviews: Number.NaN }).avgValue).toBeNull();
    expect(normalizeBreakdown({ totalReviews: -3 }).totalReviews).toBe(0);
    expect(normalizeBreakdown({ avgLocation: 4.26, totalReviews: 4.9 }).avgLocation).toBe(4.3);
    expect(normalizeBreakdown({ avgLocation: 4.26, totalReviews: 4.9 }).totalReviews).toBe(4);
  });
});
