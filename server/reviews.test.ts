import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { vi, beforeEach, describe, expect, it } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import { bookings as bookingsTable, listings as listingsTable, reviews as reviewsTable, users as usersTable } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const userA: AuthenticatedUser = {
  id: 101,
  openId: "review-user-a",
  email: "a@example.com",
  name: "User A",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const userB: AuthenticatedUser = {
  id: 202,
  openId: "review-user-b",
  email: "b@example.com",
  name: "User B",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createCtx(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

type FacBooking = {
  id: number;
  renterId: number;
  listingId: number;
  status: "Pending" | "Confirmed" | "Cancelled";
  endDate: Date;
};

type FacReview = {
  id: number;
  bookingId: number;
  listingId: number;
  userId: number;
  rating: number;
  comment: string | null;
  createdAt: Date;
  userName?: string | null;
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

type FacStore = {
  bookings: FacBooking[];
  reviews: FacReview[];
  listings: FacListing[];
  summaries: Record<number, { average: number | null; count: number | null }>;
};

/**
 * Minimal in-memory drizzle fake for the exact statement chains the `reviews`
 * router emits (listByListing join, summary, create gating lookups + insert,
 * and listings.getById with its review-summary passthrough). WHERE conditions
 * are decoded from drizzle `eq`/`and` SQL nodes by collecting bound Params in
 * call order, exactly as the router builds them.
 */
function makeFakeDb(store: FacStore) {
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

  const reviewForListing = (listingId: number) =>
    store.reviews
      .filter((r) => r.listingId === listingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, userName: r.userName ?? null }));

  const reviewForBookingAndUser = (bookingId: number, userId: number) =>
    store.reviews.filter((r) => r.bookingId === bookingId && r.userId === userId);

  const aggregateForListing = (listingId: number) => {
    const row = store.summaries[listingId];
    return row ? [{ average: row.average, count: row.count }] : [];
  };

  return {
    select: (shape: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === reviewsTable) {
          if ("userName" in shape) {
            // listByListing: select(...).from(reviews).innerJoin(users,...).where(listingId).orderBy(desc(createdAt))
            return {
              innerJoin: () => ({
                where: (condition: unknown) => ({
                  orderBy: () => thenable(reviewForListing(collectValues(condition)[0] as number)),
                }),
              }),
            };
          }
          if ("average" in shape) {
            // summary / getById aggregate: select({average,count}).from(reviews).where(listingId).limit(1)
            return {
              where: (condition: unknown) => ({
                limit: () => thenable(aggregateForListing(collectValues(condition)[0] as number)),
              }),
            };
          }
          // create duplicate check: select({id}).from(reviews).where(and(bookingId, userId)).limit(1)
          return {
            where: (condition: unknown) => {
              const [bookingId, userId] = collectValues(condition) as [number, number];
              return { limit: () => thenable(reviewForBookingAndUser(bookingId, userId)) };
            },
          };
        }
        if (table === bookingsTable) {
          // create gating: select(...).from(bookings).where(id).limit(1)
          return {
            where: (condition: unknown) => ({
              limit: () => thenable(store.bookings.filter((b) => b.id === (collectValues(condition)[0] as number))),
            }),
          };
        }
        if (table === listingsTable) {
          // getById: select({listing,...}).from(listings).leftJoin(users,...).where(and(id, status)).limit(1)
          // debug path: select({id,status}).from(listings).where(id).limit(1)
          if ("listing" in shape) {
            return {
              leftJoin: () => ({
                where: (condition: unknown) => ({
                  limit: () => {
                    const listingId = collectValues(condition)[0] as number;
                    const listing = store.listings.find((l) => l.id === listingId);
                    return thenable(
                      listing
                        ? [{ listing, ownerName: listing.ownerName, ownerRole: listing.ownerRole, agencyName: null, agencyPhone: null, whatsappPhone: null }]
                        : [],
                    );
                  },
                }),
              }),
            };
          }
          return {
            where: (condition: unknown) => ({
              limit: () => thenable(store.listings.filter((l) => l.id === (collectValues(condition)[0] as number))),
            }),
          };
        }
        throw new Error("reviews test fake: unhandled select table");
      },
    }),
    insert: (table: unknown) => ({
      values: (values: FacReview) => {
        if (table !== reviewsTable) throw new Error("reviews test fake: unhandled insert table");
        store.reviews.push({ ...values, id: store.reviews.length + 1, createdAt: values.createdAt ?? new Date() });
        return thenable(undefined);
      },
    }),
  };
}

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const seed = (): FacStore => ({
  bookings: [
    // userA owns a Confirmed, ended booking for listing 501
    { id: 1, renterId: userA.id, listingId: 501, status: "Confirmed", endDate: new Date(now - 5 * day) },
    // owned by a different user
    { id: 2, renterId: userB.id, listingId: 501, status: "Confirmed", endDate: new Date(now - 5 * day) },
    // confirmed but for a different listing
    { id: 3, renterId: userA.id, listingId: 502, status: "Confirmed", endDate: new Date(now - 5 * day) },
    // still Pending
    { id: 4, renterId: userA.id, listingId: 501, status: "Pending", endDate: new Date(now - 5 * day) },
    // confirmed but not ended yet
    { id: 5, renterId: userA.id, listingId: 501, status: "Confirmed", endDate: new Date(now + 5 * day) },
  ],
  reviews: [
    { id: 1, bookingId: 99, listingId: 501, userId: userB.id, rating: 4, comment: "قديم جداً", createdAt: new Date(now - 30 * day), userName: "User B" },
    { id: 2, bookingId: 98, listingId: 501, userId: userB.id, rating: 5, comment: "حديث نسبياً", createdAt: new Date(now - 10 * day), userName: "User B" },
  ],
  listings: [
    { id: 501, ownerId: 301, title: "Dacia Duster", category: "car", pricePerDay: 400, status: "Published", ownerName: "Agence Atlas", ownerRole: "partner" },
    { id: 502, ownerId: 301, title: "شقة فاخرة", category: "real_estate", pricePerDay: 700, status: "Published", ownerName: "Agence Atlas", ownerRole: "partner" },
  ],
  summaries: {
    501: { average: 4.266666666666667, count: 7 },
  },
});

let store: FacStore;

beforeEach(() => {
  store = seed();
  vi.mocked(getDb).mockResolvedValue(makeFakeDb(store) as unknown as Awaited<ReturnType<typeof getDb>>);
});

describe("reviews.summary — aggregate math", () => {
  it("rounds the average to one decimal and keeps the exact count", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    const summary = await caller.reviews.summary({ listingId: 501 });
    expect(summary).toEqual({ average: 4.3, count: 7 });
  });

  it("returns a truthful zero shape when the listing has no reviews", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    const summary = await caller.reviews.summary({ listingId: 502 });
    expect(summary).toEqual({ average: 0, count: 0 });
  });

  it("degrades to a zero shape when the database is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(createCtx(null));
    await expect(caller.reviews.summary({ listingId: 501 })).resolves.toEqual({ average: 0, count: 0 });
  });

  it("emits the computed SQL fragments (round to 1dp + exact count), not materialized columns", async () => {
    const source = readFileSync(resolve(process.cwd(), "server/reviewStats.ts"), "utf8");
    expect(source).toMatch(/round\(avg\(.+\)::numeric,\s*1\)::float8/);
    expect(source).toMatch(/count\(\*\)::int4/);
    expect(source).not.toMatch(/avg_rating/);
  });

  it("roundAverage/normalizeSummary math are exact at the unit level", async () => {
    const { roundAverage, normalizeSummary } = await import("./reviewStats");
    expect(roundAverage(4.2666666667)).toBe(4.3);
    expect(roundAverage(4)).toBe(4);
    expect(roundAverage(4.25)).toBe(4.3);
    expect(roundAverage(null)).toBe(0);
    expect(roundAverage(undefined)).toBe(0);
    expect(roundAverage(Number.NaN)).toBe(0);
    expect(normalizeSummary(undefined)).toEqual({ average: 0, count: 0 });
    expect(normalizeSummary({ average: null, count: null })).toEqual({ average: 0, count: 0 });
  });
});

describe("reviews.listByListing", () => {
  it("returns reviews for a listing, newest first, with the author name joined", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    const rows = await caller.reviews.listByListing({ listingId: 501 });
    expect(rows.map((r) => r.id)).toEqual([2, 1]); // newest first
    expect(rows[0].userName).toBe("User B");
    expect(rows[0].comment).toBe("حديث نسبياً");
  });

  it("returns an empty list when the database is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(createCtx(null));
    await expect(caller.reviews.listByListing({ listingId: 501 })).resolves.toEqual([]);
  });
});

describe("reviews.create — honest gating", () => {
  const valid = { listingId: 501, bookingId: 1, rating: 5, comment: "تجربة ممتازة من البداية للنهاية." };

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(caller.reviews.create(valid)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("inserts a review when the caller owns a Confirmed ended booking for that listing", async () => {
    const caller = appRouter.createCaller(createCtx(userA));
    const result = await caller.reviews.create(valid);
    expect(result).toEqual({ success: true });
    const inserted = store.reviews.find((r) => r.bookingId === valid.bookingId);
    expect(inserted).toBeDefined();
    expect(inserted).toMatchObject({ userId: userA.id, listingId: 501, rating: 5, comment: valid.comment });
  });

  it.each([
    ["booking owned by another user", { bookingId: 2 }],
    ["booking for a different listing", { bookingId: 3 }],
    ["booking that is still Pending", { bookingId: 4 }],
    ["booking that has not ended yet", { bookingId: 5 }],
    ["booking that does not exist", { bookingId: 404 }],
  ])("blocks a review when the booking is %s", async (_label, overrides) => {
    const caller = appRouter.createCaller(createCtx(userA));
    await expect(caller.reviews.create({ ...valid, ...overrides })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a second review for the same booking (one review per booking)", async () => {
    const caller = appRouter.createCaller(createCtx(userA));
    await caller.reviews.create(valid);
    store.reviews.push({ id: 50, bookingId: valid.bookingId, listingId: valid.listingId, userId: userA.id, rating: 4, comment: "تم التقييم سابقاً", createdAt: new Date() });
    await expect(caller.reviews.create(valid)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("reviews.create — zod bounds", () => {
  const call = (overrides: Record<string, unknown>) =>
    appRouter.createCaller(createCtx(userA)).reviews.create({
      listingId: 501,
      bookingId: 1,
      rating: 5,
      comment: "تجربة ممتازة من البداية للنهاية.",
      ...overrides,
    } as never);

  it.each([0, 6, -1, 7])("rejects rating %s (out of 1..5) via zod before touching the database", async (rating) => {
    await expect(call({ rating })).rejects.toThrow();
    expect(store.reviews.length).toBe(seed().reviews.length);
  });

  it("rejects a comment shorter than 10 chars", async () => {
    await expect(call({ comment: "قصير" })).rejects.toThrow();
  });

  it("rejects a comment longer than 500 chars", async () => {
    await expect(call({ comment: "x".repeat(501) })).rejects.toThrow();
  });

  it("accepts a comment of exactly 10 chars", async () => {
    await expect(call({ comment: "شكراً جزيلاً لكم" })).resolves.toEqual({ success: true });
  });
});

describe("listings.getById — computed aggregates", () => {
  it("carries averageRating + reviewCount into the detail payload", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    const detail = await caller.listings.getById({ id: 501 });
    expect(detail).not.toBeNull();
    expect(detail!.averageRating).toBe(4.3);
    expect(detail!.reviewCount).toBe(7);
    expect(detail!.id).toBe(501);
  });

  it("reports zero aggregates for an unreviewed listing", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    const detail = await caller.listings.getById({ id: 502 });
    expect(detail!.averageRating).toBe(0);
    expect(detail!.reviewCount).toBe(0);
  });
});