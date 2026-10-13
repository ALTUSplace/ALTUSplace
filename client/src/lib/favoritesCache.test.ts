import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  FAVORITES_LIST_QUERY_KEY,
  addFavoriteToList,
  createFavoriteMutations,
  favoriteListingIds,
  isUnconfirmedFavorite,
  optimisticFavoriteId,
  removeFavoriteFromList,
  type FavoriteWithListing,
} from "./favoritesCache";
import type { OptimisticMutationCallbacks } from "./optimistic";

/** A server-confirmed favorite row. */
function row(
  listingId: number,
  favoriteId = `favorite-${listingId}`,
): FavoriteWithListing {
  return {
    favoriteId,
    listingId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    listing: { id: listingId },
  };
}

function setup(initial?: FavoriteWithListing[]): QueryClient {
  const queryClient = new QueryClient();
  if (initial) {
    queryClient.setQueryData<FavoriteWithListing[]>(
      FAVORITES_LIST_QUERY_KEY,
      initial,
    );
  }
  return queryClient;
}

function idsOf(queryClient: QueryClient): Set<number> {
  return favoriteListingIds(
    queryClient.getQueryData<FavoriteWithListing[]>(FAVORITES_LIST_QUERY_KEY),
  );
}

/** Drives one toggle through the same callbacks the hook hands to tRPC. */
async function toggle<I>(
  callbacks: OptimisticMutationCallbacks<I, FavoriteWithListing[]>,
  input: I,
): Promise<void> {
  const context = await callbacks.onMutate(input);
  await callbacks.onSettled(undefined, undefined, input, context);
}

describe("FAVORITES_LIST_QUERY_KEY", () => {
  it("pins the exact key @trpc/react-query builds for favorites.list", () => {
    // getQueryKeyInternal(["favorites", "list"], undefined, "query")
    expect(FAVORITES_LIST_QUERY_KEY).toEqual([
      ["favorites", "list"],
      { type: "query" },
    ]);
  });
});

describe("favorites cache reducers", () => {
  it("prepends an unconfirmed stub row for an optimistic add", () => {
    const next = addFavoriteToList([row(1)], 2);

    expect(next.map((r) => r.listingId)).toEqual([2, 1]);
    expect(next[0].favoriteId).toBe(optimisticFavoriteId(2));
    expect(isUnconfirmedFavorite(next[0])).toBe(true);
    expect(isUnconfirmedFavorite(next[1])).toBe(false);
  });

  it("keeps the existing row when the listing is already favorited", () => {
    const current = [row(7)];
    const next = addFavoriteToList(current, 7);

    expect(next).toHaveLength(1);
    expect(next[0]).toBe(current[0]);
  });

  it("removes every row for a listing and tolerates an empty cache", () => {
    const next = removeFavoriteFromList(
      [row(1), row(2), row(1, "favorite-9")],
      1,
    );

    expect(next.map((r) => r.listingId)).toEqual([2]);
    expect(removeFavoriteFromList(undefined, 1)).toEqual([]);
    expect(addFavoriteToList(undefined, 3).map((r) => r.listingId)).toEqual([3]);
  });

  it("reads the favorited ids out of a cache entry", () => {
    expect(favoriteListingIds([row(1), row(2)])).toEqual(new Set([1, 2]));
    expect(favoriteListingIds(undefined)).toEqual(new Set());
  });
});

describe("favorites optimistic wiring", () => {
  it("never refetches favorites.list while toggling rapidly", async () => {
    const queryClient = setup([row(1)]);
    const fetches = vi.fn(async () => [row(1)]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { add, remove } = createFavoriteMutations({ queryClient });

    // An active observer, so a refetch would actually hit the network.
    const observer = new QueryObserver(queryClient, {
      queryKey: FAVORITES_LIST_QUERY_KEY,
      queryFn: fetches,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(fetches).not.toHaveBeenCalled();

    try {
      await toggle(add, { listingId: 2 });
      await toggle(add, { listingId: 3 });
      await toggle(remove, { listingId: 1 });
      await toggle(remove, { listingId: 2 });
      await toggle(add, { listingId: 1 });

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(fetches).not.toHaveBeenCalled();
      expect(idsOf(queryClient)).toEqual(new Set([1, 3]));
    } finally {
      unsubscribe();
    }
  });

  it("leaves a rapid double toggle on the last intent", async () => {
    const queryClient = setup([row(1)]);
    const { add, remove } = createFavoriteMutations({ queryClient });

    // Click 1 removes, click 2 (before the first write resolves) re-adds.
    await toggle(remove, { listingId: 1 });
    await toggle(add, { listingId: 1 });

    expect(idsOf(queryClient)).toEqual(new Set([1]));
  });

  it("never lets an older failed toggle clobber a newer write", async () => {
    const queryClient = setup([row(1)]);
    const { add, remove } = createFavoriteMutations({ queryClient });

    const staleRemove = await remove.onMutate({ listingId: 1 });
    const newerAdd = await add.onMutate({ listingId: 1 });

    remove.onError(new Error("Failed to fetch"), { listingId: 1 }, staleRemove);

    expect(newerAdd.token).toBeGreaterThan(staleRemove.token);
    expect(idsOf(queryClient)).toEqual(new Set([1]));
  });

  it("rolls the cache back to its pre-toggle snapshot when a write fails", async () => {
    const before = [row(1), row(2)];
    const queryClient = setup(before);
    const { remove } = createFavoriteMutations({ queryClient });

    const context = await remove.onMutate({ listingId: 1 });
    expect(idsOf(queryClient)).toEqual(new Set([2]));

    remove.onError(new Error("Network Error"), { listingId: 1 }, context);

    expect(idsOf(queryClient)).toEqual(new Set([1, 2]));
    expect(
      queryClient.getQueryData<FavoriteWithListing[]>(
        FAVORITES_LIST_QUERY_KEY,
      ),
    ).toEqual(before);
  });

  it("drops the optimistic row when a failed add had nothing cached before it", async () => {
    const queryClient = setup();
    const { add } = createFavoriteMutations({ queryClient });

    const context = await add.onMutate({ listingId: 9 });
    expect(context.previous).toBeUndefined();
    expect(idsOf(queryClient)).toEqual(new Set([9]));

    add.onError(new Error("Failed to fetch"), { listingId: 9 }, context);

    expect(
      queryClient.getQueryData<FavoriteWithListing[]>(
        FAVORITES_LIST_QUERY_KEY,
      ),
    ).toBeUndefined();
  });

  it("reports every failure once the cache has settled", async () => {
    const queryClient = setup([row(1)]);
    const onServerError = vi.fn();
    const { add } = createFavoriteMutations({ queryClient, onServerError });
    const failure = new Error("boom");

    const context = await add.onMutate({ listingId: 5 });
    add.onError(failure, { listingId: 5 }, context);

    expect(onServerError).toHaveBeenCalledTimes(1);
    expect(onServerError).toHaveBeenCalledWith(failure, { listingId: 5 });
    expect(idsOf(queryClient)).toEqual(new Set([1]));
  });
});
