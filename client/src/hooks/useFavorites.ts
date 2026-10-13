import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AUTH_ME_QUERY_OPTIONS } from "@/lib/authMeQueryOptions";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { classifyApiError } from "@/types/errors";
import {
  createFavoriteMutations,
  favoriteListingIds,
  isUnconfirmedFavorite,
} from "@/lib/favoritesCache";

export type { FavoriteWithListing } from "@/lib/favoritesCache";

/**
 * Wording for a failed toggle. The failure taxonomy decides the branch: an
 * expired session needs an actionable message, anything else falls back to the
 * generic "could not update favorites" line.
 */
function favoriteErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  const { strategy } = classifyApiError(error);
  return strategy === "login" ? t("loginRequiredDesc") : t("favoriteError");
}

/**
 * Server-backed favorites (wishlist) hook. The source of truth is the
 * `favorites.list` query cache; toggling writes that cache optimistically
 * through `@/lib/optimistic`, so the heart flips instantly, a failed write
 * rolls back to its snapshot, and no toggle ever refetches the whole list.
 */
export function useFavorites() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  // favorites.list is a protected procedure — fetch it only when signed in.
  // Firing it for anonymous visitors made the main.tsx UNAUTHORIZED handler
  // auto-redirect public homepage views to the owner login gate.
  const { data: me } = trpc.auth.me.useQuery(undefined, AUTH_ME_QUERY_OPTIONS);
  const isAuthed = Boolean(me);
  const {
    data,
    isLoading,
    refetch,
  } = trpc.favorites.list.useQuery(undefined, {
    staleTime: 60_000,
    enabled: isAuthed,
  });

  const { add, remove } = createFavoriteMutations({
    queryClient,
    onServerError: (error) =>
      toast.error(favoriteErrorMessage(error, t)),
  });

  const addFavorite = trpc.favorites.add.useMutation(add);
  const removeFavorite = trpc.favorites.remove.useMutation(remove);

  /** Ids in the cache, including not-yet-confirmed optimistic rows. */
  const favoriteIds = useMemo(() => favoriteListingIds(data), [data]);

  /**
   * Rows that are safe to render: optimistic adds carry a listing stub with no
   * title/price, so they are held back until a refetch replaces them with the
   * real server payload.
   */
  const favorites = useMemo(
    () => (data ?? []).filter((row) => !isUnconfirmedFavorite(row)),
    [data],
  );

  /** True while the wishlist holds rows the server has not confirmed yet. */
  const hasUnconfirmedFavorites = useMemo(
    () => (data ?? []).some(isUnconfirmedFavorite),
    [data],
  );

  const isFavorite = useCallback(
    (listingId: number) => favoriteIds.has(listingId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    (listingId: number) => {
      if (favoriteIds.has(listingId)) {
        removeFavorite.mutate({ listingId });
      } else {
        addFavorite.mutate({ listingId });
      }
    },
    [favoriteIds, addFavorite, removeFavorite],
  );

  return {
    favorites,
    isLoading,
    refetch,
    isFavorite,
    toggleFavorite,
    hasUnconfirmedFavorites,
  };
}
