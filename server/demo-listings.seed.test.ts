import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_AGENCY_OPENID,
  DEMO_LISTING_ROWS,
  seedDemoListings,
} from "./seed/demo-listings";
import { listings as listingsTable, users as usersTable } from "../drizzle/schema";

/**
 * Minimal fake for the exact chains server/seed/demo-listings.ts issues:
 *  - marker check: select({id}).from(listings).innerJoin(users).
 *    where(eq(openId, DEMO_AGENCY_OPENID)).limit(1)
 *  - agency lookup: select({id}).from(users).where(eq(openId, ...)).limit(1)
 *  - insert(users).values(...).returning({id})
 *  - insert(listings).values([...])
 *  - refresh path: select({id,title}).from(listings).where(eq(ownerId, ...))
 *    then update(listings).set({imageUrl, images}).where(eq(id, ...))
 */
function makeSeedFakeDb() {
  const thenable = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });
  const store: {
    users: Array<{ id: number; openId: string; name?: string; role?: unknown; whatsappNumber?: string | null }>;
    listings: Array<{
      id: number;
      ownerId: number;
      status?: unknown;
      category?: string;
      title?: string;
      imageUrl?: string;
      images?: string[];
    }>;
  } = {
    users: [],
    listings: [],
  };
  let nextUserId = 1000;
  let nextListingId = 5000;
  const agencyUserId = () => store.users.find((u) => u.openId === DEMO_AGENCY_OPENID)?.id ?? null;

  /** eq(listings.id, value) fragments carry the id in their only `Param` chunk. */
  const extractParamValue = (predicate: unknown): unknown => {
    const chunks = (predicate as { queryChunks?: unknown[] })?.queryChunks ?? [];
    const param = chunks.find(
      (chunk) =>
        chunk !== null &&
        typeof chunk === "object" &&
        (chunk as { constructor?: { name?: string } }).constructor?.name === "Param",
    );
    return param ? (param as { value?: unknown }).value : undefined;
  };

  return {
    store,
    select: (shape: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === listingsTable) {
          return {
            innerJoin: () => ({
              where: () => ({
                limit: () =>
                  thenable(
                    agencyUserId() !== null && store.listings.some((l) => l.ownerId === agencyUserId())
                      ? [{ id: 1 }]
                      : [],
                  ),
              }),
            }),
            where: () =>
              thenable(
                store.listings
                  .filter((l) => l.ownerId === agencyUserId())
                  .map((l) => ({ id: l.id, title: l.title })),
              ),
          };
        }
        if (table === usersTable) {
          return {
            where: () => ({
              limit: () => thenable(agencyUserId() !== null ? [{ id: agencyUserId() }] : []),
            }),
          };
        }
        throw new Error("seed test fake: unhandled select table");
      },
    }),
    insert: (table: unknown) => ({
      values: (rows: unknown) => {
        const array = Array.isArray(rows) ? rows : [rows];
        if (table === usersTable) {
          const ids: number[] = [];
          array.forEach((row) => {
            const id = nextUserId;
            store.users.push({ id, ...(row as { openId: string }) });
            ids.push(id);
            nextUserId += 1;
          });
          return { returning: () => thenable(ids.map((id) => ({ id }))) };
        }
        if (table === listingsTable) {
          array.forEach((row) => {
            const id = nextListingId;
            store.listings.push({ id, ...(row as { ownerId: number }) });
            nextListingId += 1;
          });
          return thenable(undefined);
        }
        throw new Error("seed test fake: unhandled insert table");
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (predicate: unknown) => {
          const id = extractParamValue(predicate);
          const rows = table === listingsTable ? store.listings : table === usersTable ? store.users : null;
          if (!rows) throw new Error("seed test fake: unhandled update table");
          const target = rows.find((r) => r.id === id);
          if (target) Object.assign(target, values);
          return thenable(target ? [target] : []);
        },
      }),
    }),
  };
}

describe("demo listings seed", () => {
  beforeEach(() => {});

  it("seeds 6 cars + 4 apartments under the demo agency on a fresh db", async () => {
    const db = makeSeedFakeDb();
    const result = await seedDemoListings(db as never);

    expect(result.skipped).toBeNull();
    expect(result.cars).toBe(6);
    expect(result.properties).toBe(4);
    expect(result.listings).toBe(10);
    expect(result.updated).toBe(0);
    expect(db.store.listings).toHaveLength(10);

    const agency = db.store.users.find((u) => u.openId === DEMO_AGENCY_OPENID);
    expect(agency).toBeDefined();
    expect(agency?.name).toBe("ALTUSplace Demo Partner");
    expect(agency?.role).toBe("partner");
    expect(agency?.whatsappNumber).toBe("212754382654");

    expect(db.store.listings.every((l) => l.ownerId === result.agencyId)).toBe(true);
    expect(db.store.listings.every((l) => l.status === "Published")).toBe(true);
  });

  it("is idempotent — a second run refreshes image URLs in place without adding rows", async () => {
    const db = makeSeedFakeDb();
    await seedDemoListings(db as never);

    // Simulate stale photos in the existing demo rows.
    db.store.listings.forEach((l) => {
      l.imageUrl = "https://stale.example/old.jpg";
      l.images = ["https://stale.example/old-gallery.jpg"];
    });

    const result = await seedDemoListings(db as never);

    expect(result.skipped).toBe("already-seeded");
    expect(result.updated).toBe(10);
    expect(db.store.listings).toHaveLength(10); // no duplicate rows
    expect(db.store.users).toHaveLength(1); // agency not duplicated

    // Image URLs were refreshed in place — each row now carries the verified
    // images of the demo row it matches by title.
    const imagesByTitle = new Map(DEMO_LISTING_ROWS.map((row) => [row.title, { imageUrl: row.imageUrl, images: row.images }]));
    for (const l of db.store.listings) {
      const expected = imagesByTitle.get(l.title ?? "");
      expect(expected).toBeDefined();
      expect(l.imageUrl).toBe(expected?.imageUrl);
      expect(l.images).toEqual(expected?.images);
    }
  });

  it("dataset invariants hold (categories, prices, cities, images, retention window)", () => {
    const cars = DEMO_LISTING_ROWS.filter((r) => r.category === "car");
    const props = DEMO_LISTING_ROWS.filter((r) => r.category === "real_estate");

    expect(cars).toHaveLength(6);
    expect(props).toHaveLength(4);

    for (const car of cars) {
      expect(car.pricePerDay).toBeGreaterThanOrEqual(300);
      expect(car.pricePerDay).toBeLessThanOrEqual(600);
      expect(car.seats).toBe(5);
      expect(car.year).toBeGreaterThanOrEqual(2021);
      expect(["الدار البيضاء", "مراكش", "طنجة"]).toContain(car.city);
      expect(car.images?.length).toBeGreaterThanOrEqual(3);
      expect(typeof car.fuelType).toBe("string");
      expect(typeof car.transmission).toBe("string");
    }

    for (const p of props) {
      expect(["مراكش", "الدار البيضاء"]).toContain(p.city);
      expect(p.propertyType).toBe("Shaqqa");
      expect(p.rentalPeriod).toBe("daily");
      expect(p.rooms).toBeGreaterThanOrEqual(1);
      expect(p.area).toBeGreaterThanOrEqual(40);
      expect(typeof p.pricePerMonth).toBe("number");
      expect(p.amenities).toContain("Wifi");
    }

    // All rows sit inside demoCleanup's 30-day retention window so a fresh
    // demo catalog is not instantly purged by the cleanup cron.
    const oldest = Math.min(...DEMO_LISTING_ROWS.map((r) => r.createdAt!.getTime()));
    expect(Date.now() - oldest).toBeLessThan(30 * 24 * 60 * 60 * 1000);

    const titles = DEMO_LISTING_ROWS.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});