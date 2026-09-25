import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

/** Shape of one favorite row returned by trpc.favorites.list. */
export type FavoriteWithListing = {
  favoriteId: string;
  listingId: number;
  createdAt: Date;
  listing: Record<string, unknown>;
};

/**
 * Server-backed favorites (wishlist) hook. The source of truth is the
 * `favorites.list` query; toggling is optimistic — the button flips instantly
 * via a local pending-set and rolls back on failure, then the query cache is
 * invalidated so the /favorites page always reflects server truth.
 */
export function useFavorites() {
  const { t } = useLanguage();
  const utils = trpc.useUtils();
  // favorites.list is a protected procedure — fetch it only when signed in.
  // Firing it for anonymous visitors made the main.tsx UNAUTHORIZED handler
  // auto-redirect public homepage views to the owner login gate.
  const { data: me } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthed = Boolean(me);
  const {
    data: favorites,
    isLoading,
    refetch,
  } = trpc.favorites.list.useQuery(undefined, {
    staleTime: 60_000,
    enabled: isAuthed,
  });

  /** Optimistic delta applied before the server round-trip settles. */
  const [pendingAdds, setPendingAdds] = useState<Set<number>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<number>>(new Set());

  const serverIds = useMemo(
    () => new Set((favorites ?? []).map((f) => f.listingId)),
    [favorites]
  );

  const add = trpc.favorites.add.useMutation({
    onMutate: ({ listingId }) => {
      setPendingAdds((prev) => new Set(prev).add(listingId));
      setPendingRemoves((prev) => {
        if (!prev.has(listingId)) return prev;
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    },
    onError: (_error, { listingId }) => {
      setPendingAdds((prev) => {
        if (!prev.has(listingId)) return prev;
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
      toast.error(t("favorite.error"));
    },
    onSettled: () => {
      setPendingAdds(new Set());
      setPendingRemoves(new Set());
      utils.favorites.list.invalidate();
    },
  });

  const remove = trpc.favorites.remove.useMutation({
    onMutate: ({ listingId }) => {
      if (listingId !== undefined) {
        setPendingRemoves((prev) => new Set(prev).add(listingId));
        setPendingAdds((prev) => {
          if (!prev.has(listingId)) return prev;
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
      }
    },
    onError: (_error, { listingId }) => {
      if (listingId !== undefined) {
        setPendingRemoves((prev) => {
          if (!prev.has(listingId)) return prev;
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
      }
      toast.error(t("favorite.error"));
    },
    onSettled: () => {
      setPendingAdds(new Set());
      setPendingRemoves(new Set());
      utils.favorites.list.invalidate();
    },
  });

  const isFavorite = useCallback(
    (listingId: number) => {
      if (pendingAdds.has(listingId)) return true;
      if (pendingRemoves.has(listingId)) return false;
      return serverIds.has(listingId);
    },
    [pendingAdds, pendingRemoves, serverIds]
  );

  const toggleFavorite = useCallback(
    (listingId: number) => {
      if (isFavorite(listingId)) {
        remove.mutate({ listingId });
      } else {
        add.mutate({ listingId });
      }
    },
    [isFavorite, add, remove]
  );

  return {
    favorites,
    isLoading,
    refetch,
    isFavorite,
    toggleFavorite,
    addPending: add.isPending,
    removePending: remove.isPending,
    pendingAdds,
    pendingRemoves,
  };
}