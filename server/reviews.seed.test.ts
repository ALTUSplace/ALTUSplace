import { vi, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_OWNER_OPENID,
  RENTER_OPENID_PREFIX,
  TARGET_TOTAL_REVIEWS,
  distributeTargets,
  seedDemoReviews,
} from "./seed/reviews";
import { bookings as bookingsTable, listings as listingsTable, reviews as reviewsTable, users as usersTable } from "../drizzle/schema";

type DemoListingRow = { id: number; pricePerDay: number };

/**
 * Minimal fake for the exact chains server/seed/reviews.ts issues:
 *  - marker check: select({id}).from(users).where(ilike(openId, prefix%)).limit(1)
 *  - demo listings: select({id, pricePerDay}).from(listings).innerJoin(users,...).
 *    where(and(eq(openId, DEMO_OWNER), inArray(status, [Published])))
 *  - insert(users).values([...]).returning({id})
 *  - insert(bookings).values([...]).returning({id})
 *  - insert(reviews).values([...])
 */
function makeSeedFakeDb(initial: { demoListings: DemoListingRow[] }) {
  const thenable = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });
  const store = {
    demoListings: [...initial.demoListings],
    insertedUsers: [] as Array<{ openId: string; name: string }>,
    insertedBookings: [] as Array<{ renterId: number; listingId: number; startDate: Date; endDate: Date }>,
    insertedReviews: [] as Array<{ userId: number; listingId: number; bookingId: number; rating: number; comment: string }>,
  };
  let nextUserId = 1000;
  let nextBookingId = 5000;

  return {
    store,
    select: (shape: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === usersTable) {
          // marker check: previous run's demo renters exist → skip
          return { where: () => ({ limit: () => thenable(store.insertedUsers.length > 0 ? [{ id: 1 }] : []) }) };
        }
        if (table === listingsTable) {
          // demo listings fetch (no limit)
          return {
            innerJoin: () => ({
              where: () => thenable(store.demoListings.map((l) => ({ id: l.id, pricePerDay: l.pricePerDay }))),
            }),
          };
        }
        throw new Error("seed test fake: unhandled select table");
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown[]) => {
        if (table === usersTable) {
          (values as Array<{ openId: string; name: string }>).forEach((row) => {
            store.insertedUsers.push(row);
          });
          return { returning: () => thenable((values as unknown[]).map((_, index) => ({ id: nextUserId + index }))) };
        }
        if (table === bookingsTable) {
          (values as Array<Record<string, unknown>>).forEach((row) => store.insertedBookings.push(row as never));
          return {
            returning: () => thenable((values as unknown[]).map((_, index) => ({ id: nextBookingId + index }))),
          };
        }
        if (table === reviewsTable) {
          (values as Array<Record<string, unknown>>).forEach((row) => store.insertedReviews.push(row as never));
          return thenable(undefined);
        }
        throw new Error("seed test fake: unhandled insert table");
      },
    }),
  };
}

describe("reviews demo seed — distribution math", () => {
  const random = () => 0.5;

  it("saturates the 3-8 band to reach the 30+ total when fewer than 5 demo listings exist", () => {
    const counts = distributeTargets(4, random);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(TARGET_TOTAL_REVIEWS);
    expect(Math.max(...counts)).toBeLessThanOrEqual(8);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(7);
  });

  it("applies the 60/30/10 bands when there are enough demo listings", () => {
    const counts = distributeTargets(10, random);
    const bands = counts.map((c) => (c >= 3 && c <= 8 ? "heavy" : c >= 1 && c <= 2 ? "light" : "zero"));
    expect(bands.filter((b) => b === "heavy")).toHaveLength(6);
    expect(bands.filter((b) => b === "light")).toHaveLength(3);
    expect(bands.filter((b) => b === "zero")).toHaveLength(1);
  });
});

describe("reviews demo seed — idempotency + data quality", () => {
  const demoListings = [
    { id: 3, pricePerDay: 450 },
    { id: 4, pricePerDay: 500 },
    { id: 5, pricePerDay: 700 },
    { id: 6, pricePerDay: 650 },
  ];

  it("inserts demo renters, ended confirmed bookings and reviews — rated 4-5 weighted, comments 10-500", async () => {
    const fake = makeSeedFakeDb({ demoListings });
    const result = await seedDemoReviews(fake as never);

    expect(result.skipped).toBeNull();
    expect(result.listings).toBe(4);
    expect(result.reviews).toBe(TARGET_TOTAL_REVIEWS);
    expect(result.overallAverage).toBeGreaterThanOrEqual(4.0);
    expect(result.overallAverage).toBeLessThanOrEqual(4.6);
    expect(result.perListing.reduce((sum, entry) => sum + entry.rows, 0)).toBe(TARGET_TOTAL_REVIEWS);

    expect(fake.store.insertedUsers).toHaveLength(TARGET_TOTAL_REVIEWS);
    expect(fake.store.insertedUsers.every((u) => u.openId.startsWith(RENTER_OPENID_PREFIX))).toBe(true);
    expect(fake.store.insertedBookings).toHaveLength(TARGET_TOTAL_REVIEWS);
    expect(fake.store.insertedReviews).toHaveLength(TARGET_TOTAL_REVIEWS);

    for (const review of fake.store.insertedReviews) {
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(review.comment.length).toBeGreaterThanOrEqual(10);
      expect(review.comment.length).toBeLessThanOrEqual(500);
    }
    // reviewer identity: every review belongs to a seeded demo renter
    const userIds = new Set(fake.store.insertedUsers.map((_, index) => 1000 + index));
    for (const review of fake.store.insertedReviews) {
      expect(userIds.has(review.userId)).toBe(true);
    }
    // bookings are Confirmed + already ended, linked to the review listings
    const confirmedEnded = fake.store.insertedBookings.every(
      (b) => b.endDate.getTime() < Date.now() && b.endDate.getTime() > 0,
    );
    expect(confirmedEnded).toBe(true);
    const bookingListings = new Set(fake.store.insertedBookings.map((b) => b.listingId));
    expect(bookingListings).toEqual(new Set(demoListings.map((l) => l.id)));
  });

  it("skips entirely on a second run (idempotent — no duplicate rows)", async () => {
    const fake = makeSeedFakeDb({ demoListings });
    const first = await seedDemoReviews(fake as never);
    expect(first.skipped).toBeNull();

    const capturedUsers = fake.store.insertedUsers.length;
    const capturedBookings = fake.store.insertedBookings.length;
    const capturedReviews = fake.store.insertedReviews.length;

    const second = await seedDemoReviews(fake as never);
    expect(second.skipped).toBe("already-seeded");
    expect(fake.store.insertedUsers).toHaveLength(capturedUsers);
    expect(fake.store.insertedBookings).toHaveLength(capturedBookings);
    expect(fake.store.insertedReviews).toHaveLength(capturedReviews);
  });

  it("skips cleanly when no demo-owned published listings exist", async () => {
    const fake = makeSeedFakeDb({ demoListings: [] });
    const result = await seedDemoReviews(fake as never);
    expect(result.skipped).toBe("no-demo-listings");
    expect(fake.store.insertedReviews).toHaveLength(0);
  });

  it("the demo owner constant matches the app's demo conventions (demoSeed/demoCleanup)", async () => {
    const [seedSource, cleanupSource] = await Promise.all([
      import("./seed/reviews"),
      import("./cron/demoCleanup"),
    ]);
    expect(DEMO_OWNER_OPENID).toBe("demo-owner-altusplace");
    expect(seedSource.DEMO_OWNER_OPENID).toBe(DEMO_OWNER_OPENID);
    expect(cleanupSource.demoCleanupHandler).toBeTypeOf("function");
  });
});