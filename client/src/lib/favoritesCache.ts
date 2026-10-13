import type { QueryClient } from "@tanstack/react-query";
import {
  optimisticMutation,
  type OptimisticMutationCallbacks,
} from "./optimistic";

/**
 * Favorites cache primitives and optimistic wiring (roadmap Phase C / task O2).
 *
 * `favorites.list` is the single source of truth for the wishlist, so an
 * instant heart toggle has to be expressed as a transform of that collection.
 * Everything the hook needs is here:
 *
 * - `FAVORITES_LIST_QUERY_KEY` pins the exact React Query key tRPC builds for
 *   `favorites.list`, so `setQueryData` / `cancelQueries` address the entry the
 *   `useQuery` observer actually subscribes to.
 * - Pure reducers add / remove a listing id in the cached collection.
 * - `createFavoriteMutations` wires both reducers into the O1 optimistic
 *   engine (`@/lib/optimistic`).
 *
 * Deliberately free of React, tRPC and toast imports so all of it is
 * unit-testable in the node test environment.
 */

/** Shape of one favorite row returned by `favorites.list`. */
export interface FavoriteWithListing {
  favoriteId: string;
  listingId: number;
  createdAt: Date;
  /** Server listing payload; `unknown` so callers narrow it themselves. */
  listing: unknown;
}

/**
 * Exact query key `@trpc/react-query` v11 builds for `favorites.list` with no
 * input: `[procedurePath, { type: "query" }]` (see `getQueryKeyInternal`).
 *
 * React Query resolves this key by exact hash in `setQueryData`, so it cannot be
 * shortened to `["favorites", "list"]` — that hashes to a different cache entry
 * and would leave the one the observer watches untouched.
 */
export const FAVORITES_LIST_QUERY_KEY = [
  ["favorites", "list"],
  { type: "query" },
] as const;

/**
 * Placeholder id for a favorite the server has not confirmed yet. Real rows
 * carry a uuid, so this prefix also marks rows that hold no listing payload.
 */
export const OPTIMISTIC_FAVORITE_ID_PREFIX = "optimistic:";

export function optimisticFavoriteId(listingId: number): string {
  return `${OPTIMISTIC_FAVORITE_ID_PREFIX}${listingId}`;
}

/** True when `row` is an unconfirmed optimistic row rather than server truth. */
export function isUnconfirmedFavorite(row: FavoriteWithListing): boolean {
  return row.favoriteId.startsWith(OPTIMISTIC_FAVORITE_ID_PREFIX);
}

/** The favorited listing ids held by a `favorites.list` cache entry. */
export function favoriteListingIds(
  rows: readonly FavoriteWithListing[] | undefined,
): Set<number> {
  return new Set((rows ?? []).map((row) => row.listingId));
}

/**
 * Optimistic `add`: prepend a row for `listingId` unless it is already present.
 * Only the id is known at the click site, so the row carries a minimal listing
 * stub; the next refetch replaces it with the full server payload.
 *
 * Always returns an array — React Query treats a returned `undefined` as
 * "no change".
 */
export function addFavoriteToList(
  rows: readonly FavoriteWithListing[] | undefined,
  listingId: number,
): FavoriteWithListing[] {
  const current = rows ?? [];
  if (current.some((row) => row.listingId === listingId)) return [...current];
  return [
    {
      favoriteId: optimisticFavoriteId(listingId),
      listingId,
      createdAt: new Date(),
      listing: { id: listingId },
    },
    ...current,
  ];
}

/** Optimistic `remove`: drop every row for `listingId`, in place. */
export function removeFavoriteFromList(
  rows: readonly FavoriteWithListing[] | undefined,
  listingId: number,
): FavoriteWithListing[] {
  return (rows ?? []).filter((row) => row.listingId !== listingId);
}

/** `favorites.add` input (mirrors the server schema). */
export type FavoriteAddInput = { listingId: number };

/** `favorites.remove` input (mirrors the server schema). */
export type FavoriteRemoveInput = {
  favoriteId?: string;
  listingId?: number;
};

export interface FavoriteMutations {
  add: OptimisticMutationCallbacks<FavoriteAddInput, FavoriteWithListing[]>;
  remove: OptimisticMutationCallbacks<
    FavoriteRemoveInput,
    FavoriteWithListing[]
  >;
}

/**
 * The optimistic callbacks for both favorites mutations, ready to hand to
 * `trpc.favorites.add` / `.remove`.
 *
 * `invalidateOnSettled` is off: toggling only ever writes the collection in
 * place, so a toggle must not trigger a `favorites.list` refetch. Consumers that
 * need server truth (the /favorites grid) reconcile explicitly instead.
 */
export function createFavoriteMutations(options: {
  queryClient: QueryClient;
  /** Called once per failure, after the cache has been rolled back. */
  onServerError?: (error: unknown) => void;
}): FavoriteMutations {
  const { queryClient, onServerError } = options;

  return {
    add: optimisticMutation<FavoriteAddInput, FavoriteWithListing[]>({
      queryClient,
      queryKey: FAVORITES_LIST_QUERY_KEY,
      update: (current, input) => addFavoriteToList(current, input.listingId),
      onServerError,
      invalidateOnSettled: false,
    }),

    remove: optimisticMutation<FavoriteRemoveInput, FavoriteWithListing[]>({
      queryClient,
      queryKey: FAVORITES_LIST_QUERY_KEY,
      // The server also accepts a favoriteId-only payload; this hook always
      // sends the listing id, so anything else is a no-op here.
      update: (current, input) =>
        input.listingId === undefined
          ? (current ?? [])
          : removeFavoriteFromList(current, input.listingId),
      onServerError,
      invalidateOnSettled: false,
    }),
  };
}
