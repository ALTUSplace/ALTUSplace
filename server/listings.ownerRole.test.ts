import { vi, beforeEach, describe, expect, it } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const listingRow = {
  id: 7,
  ownerId: 1928,
  title: "Dacia Duster",
  titleFr: null,
  description: "Test listing",
  category: "car",
  pricePerDay: 400,
  imageUrl: "https://example.com/duster.jpg",
  status: "Published",
  city: "Casablanca",
  lat: 33.5731,
  lng: -7.5898,
  createdAt: new Date(),
};

const searchRows = [{ listing: listingRow, ownerName: "Agence X", ownerRole: "partner" }];

/** Minimal drizzle chain fake covering the select/from/leftJoin/where/orderBy/groupBy calls of listings.search. */
function makeFakeDb() {
  const listingThenable = { then: (resolve: (value: unknown) => void) => resolve(searchRows) };
  const emptyThenable = { then: (resolve: (value: unknown) => void) => resolve([]) };
  const where = () => ({
    orderBy: () => listingThenable,
    groupBy: () => emptyThenable,
  });
  return {
    select: () => ({
      from: () => ({ leftJoin: () => ({ where }), where }),
    }),
  };
}

function buildCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("listings.search — ownerRole passthrough", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue(makeFakeDb() as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  it("returns ownerRole on the search response so map results can show the badge", async () => {
    const caller = appRouter.createCaller(buildCtx());
    const result = await caller.listings.search({ type: "car" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].ownerRole).toBe("partner");
    expect(result.items[0].ownerName).toBe("Agence X");
  });
});