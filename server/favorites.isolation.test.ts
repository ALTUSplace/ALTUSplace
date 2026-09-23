import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi, beforeEach, describe, expect, it } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import { favorites as favoritesTable, listings as listingsTable } from "../drizzle/schema";
import { UNAUTHED_ERR_MSG } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const userA: AuthenticatedUser = {
  id: 101,
  openId: "fav-user-a",
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
  openId: "fav-user-b",
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

type FacListing = {
  id: number;
  ownerId: number;
  title: string;
  titleFr: string | null;
  description: string | null;
  category: string;
  pricePerDay: number;
  pricePerMonth: number | null;
  imageUrl: string | null;
  city: string;
  fuelType: string | null;
  transmission: string | null;
  rooms: number | null;
  officeType: string | null;
  rentalPeriod: string | null;
  amenities: string | null;
  status: string;
  ownerName: string;
};

type FacFavorite = { favoriteId: string; userId: number; listingId: number; createdAt: Date };

type FacStore = { listings: FacListing[]; favorites: FacFavorite[] };

/**
 * Minimal in-memory drizzle fake that executes the exact statement chains the
 * `favorites` router emits. WHERE conditions are decoded from drizzle's `eq`/`and`
 * SQL nodes by collecting the bound Param values in call order
 * (userId first, then favoriteId/listingId), matching how the router builds them.
 */
function makeFakeDb(store: FacStore) {
  const thenable = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });

  /** Collects the bound values out of an `eq`/`and` SQL node, in parameter order. */
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

  const listingBy = (id: number) => store.listings.find((l) => l.id === id);

  // favorites.list: select(...).from(favorites).innerJoin(...).leftJoin(...).where(userId).orderBy(...)
  const runList = (userValues: unknown[]) => {
    const [userId] = userValues as [number];
    return store.favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((f) => {
        const listing = listingBy(f.listingId);
        return {
          favoriteId: f.favoriteId,
          listingId: f.listingId,
          createdAt: f.createdAt,
          listing,
          ownerName: listing?.ownerName ?? null,
        };
      });
  };

  // isFavorited / add duplicate-check: select(...).from(favorites).where(and(userId, listingId)).limit(1)
  const runFavoriteLookup = (userValues: unknown[]) => {
    const [userId, listingId] = userValues as [number, number];
    return store.favorites.filter((f) => f.userId === userId && f.listingId === listingId);
  };

  // add listing-existence check: select({id}).from(listings).where(eq(id)).limit(1)
  const runListingCheck = (userValues: unknown[]) => {
    const [listingId] = userValues as [number];
    return store.listings.filter((l) => l.id === listingId);
  };

  // add insert: insert(favorites).values({userId, listingId}).returning({favoriteId, createdAt})
  const runInsert = (values: { userId: number; listingId: number }) => {
    const createdAt = new Date();
    const favoriteId = randomUUID();
    store.favorites.push({ favoriteId, userId: values.userId, listingId: values.listingId, createdAt });
    return [{ favoriteId, createdAt }];
  };

  // remove: delete(favorites).where(and([userId, ...])).returning({favoriteId})
  const runDelete = (userValues: unknown[]) => {
    const [userId, target, maybeListing] = userValues as [number, string | number, number | undefined];
    const removed: { favoriteId: string }[] = [];
    store.favorites = store.favorites.filter((f) => {
      const matches =
        f.userId === userId &&
        (maybeListing !== undefined
          ? f.listingId === maybeListing
          : typeof target === "string"
            ? f.favoriteId === target
            : f.listingId === target);
      if (matches) removed.push({ favoriteId: f.favoriteId });
      return !matches;
    });
    return removed;
  };

  return {
    select: (shape: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === favoritesTable) {
          // favorites.list joins through innerJoin/leftJoin; lookups go through where(...).limit(1)
          return "listing" in shape
            ? {
                innerJoin: () => ({
                  leftJoin: () => ({
                    where: (condition: unknown) => ({
                      orderBy: () => thenable(runList(collectValues(condition))),
                    }),
                  }),
                }),
              }
            : {
                where: (condition: unknown) => ({
                  limit: () => thenable(runFavoriteLookup(collectValues(condition))),
                }),
              };
        }
        if (table === listingsTable) {
          return {
            where: (condition: unknown) => ({
              limit: () => thenable(runListingCheck(collectValues(condition))),
            }),
          };
        }
        throw new Error("favorites test fake: unhandled select table");
      },
    }),
    insert: (_table: unknown) => ({
      values: (values: { userId: number; listingId: number }) => ({
        returning: () => thenable(runInsert(values)),
      }),
    }),
    delete: (table: unknown) => {
      if (table !== favoritesTable) throw new Error("favorites test fake: unhandled delete table");
      return {
        where: (condition: unknown) => ({
          returning: () => thenable(runDelete(collectValues(condition))),
        }),
      };
    },
  };
}

const seed = (): FacStore => ({
  listings: [
    {
      id: 501,
      ownerId: 302,
      title: "Dacia Duster",
      titleFr: null,
      description: "SUV",
      category: "car",
      pricePerDay: 400,
      pricePerMonth: null,
      imageUrl: "https://example.com/duster.jpg",
      city: "Casablanca",
      fuelType: "diesel",
      transmission: "manual",
      rooms: null,
      officeType: null,
      rentalPeriod: "daily",
      amenities: "wifi",
      status: "Published",
      ownerName: "Agence Atlas",
    },
    {
      id: 502,
      ownerId: 302,
      title: "شقة فاخرة",
      titleFr: "Appartement de luxe",
      description: "2 chambres",
      category: "property",
      pricePerDay: 1200,
      pricePerMonth: 9000,
      imageUrl: "https://example.com/apartment.jpg",
      city: "Marrakech",
      fuelType: null,
      transmission: null,
      rooms: 2,
      officeType: null,
      rentalPeriod: "monthly",
      amenities: "wifi,pool",
      status: "Available",
      ownerName: "Agence Atlas",
    },
  ],
  favorites: [],
});

describe("favorites router — authentication & graceful degradation", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects every procedure for unauthenticated callers", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(caller.favorites.list()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    await expect(caller.favorites.isFavorited({ listingId: 501 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.favorites.add({ listingId: 501 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.favorites.remove({ listingId: 501 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lists [] when the database is unavailable", async () => {
    const caller = appRouter.createCaller(createCtx(userA));
    await expect(caller.favorites.list()).resolves.toEqual([]);
  });

  it("rejects invalid inputs via zod before hitting the database", async () => {
    const caller = appRouter.createCaller(createCtx(userA));
    await expect(caller.favorites.add({ listingId: 0 })).rejects.toThrow();
    await expect(caller.favorites.add({ listingId: -5 })).rejects.toThrow();
    await expect(caller.favorites.remove({})).rejects.toThrow();
    await expect(caller.favorites.isFavorited({ listingId: NaN })).rejects.toThrow();
  });

  it("fails gracefully when the database is unavailable", async () => {
    const caller = appRouter.createCaller(createCtx(userA));
    await expect(caller.favorites.add({ listingId: 501 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    await expect(caller.favorites.remove({ listingId: 501 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("favorites router — per-user isolation", () => {
  let store: FacStore;
  beforeEach(() => {
    store = seed();
    vi.mocked(getDb).mockResolvedValue(makeFakeDb(store) as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  it("lists only the caller's own favorites", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    const callerB = appRouter.createCaller(createCtx(userB));

    await callerA.favorites.add({ listingId: 501 });
    await callerB.favorites.add({ listingId: 502 });

    const aIds = (await callerA.favorites.list()).map((row) => row.listingId);
    expect(aIds).toEqual([501]);
    expect(aIds).not.toContain(502);

    const bIds = (await callerB.favorites.list()).map((row) => row.listingId);
    expect(bIds).toEqual([502]);
    expect(bIds).not.toContain(501);
  });

  it("blocks one user from removing another user's favorite (NOT_FOUND, nothing deleted)", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    const callerB = appRouter.createCaller(createCtx(userB));

    const added = await callerA.favorites.add({ listingId: 501 });
    const favoriteId = added.favoriteId as string;

    await expect(callerB.favorites.remove({ favoriteId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // user A's favorite is untouched.
    const aIds = (await callerA.favorites.list()).map((row) => row.listingId);
    expect(aIds).toEqual([501]);
  });

  it("blocks cross-user removal by listingId too", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    const callerB = appRouter.createCaller(createCtx(userB));

    await callerA.favorites.add({ listingId: 502 });

    await expect(callerB.favorites.remove({ listingId: 502 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await callerA.favorites.list()).map((row) => row.listingId)).toContain(502);
  });

  it("duplicate add for the same user+listing is blocked", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    await callerA.favorites.add({ listingId: 501 });
    await expect(callerA.favorites.add({ listingId: 501 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await callerA.favorites.list())).toHaveLength(1);
  });

  it("adding a nonexistent listing is rejected", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    await expect(callerA.favorites.add({ listingId: 99999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("isFavorited reflects the caller's own rows only", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    const callerB = appRouter.createCaller(createCtx(userB));
    await callerA.favorites.add({ listingId: 501 });

    await expect(callerA.favorites.isFavorited({ listingId: 501 })).resolves.toBe(true);
    await expect(callerB.favorites.isFavorited({ listingId: 501 })).resolves.toBe(false);
  });

  it("remove accepts either favoriteId or listingId", async () => {
    const callerA = appRouter.createCaller(createCtx(userA));
    const added = await callerA.favorites.add({ listingId: 501 });
    await expect(callerA.favorites.remove({ favoriteId: added.favoriteId as string })).resolves.toEqual({
      success: true,
    });
    expect(store.favorites).toHaveLength(0);

    await callerA.favorites.add({ listingId: 502 });
    await expect(callerA.favorites.remove({ listingId: 502 })).resolves.toEqual({ success: true });
    expect(store.favorites).toHaveLength(0);
  });
});

describe("favorites router — schema & scope audit", () => {
  it("scopes every favorites read/write to the caller's userId", () => {
    const routers = readFileSync(resolve(import.meta.dirname, "routers.ts"), "utf8");
    expect(routers).toContain("favorites: router({");
    expect(routers).toContain("eq(favorites.userId, ctx.user!.id)");
    expect(routers).toContain("add: protectedProcedure");
    expect(routers).toContain("remove: protectedProcedure");
    expect(routers).toContain("list: protectedProcedure");
  });

  it("protects against duplicates at the schema level with a unique (user_id, listing_id) index", () => {
    const schema = readFileSync(resolve(import.meta.dirname, "../drizzle/schema.ts"), "utf8");
    expect(schema).toContain('pgTable("favorites"');
    expect(schema).toContain('uniqueIndex("favorites_user_listing_unique_idx")');
    const migration = readFileSync(resolve(import.meta.dirname, "../drizzle/0014_add_favorites.sql"), "utf8");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "favorites_user_listing_unique_idx"');
  });
});