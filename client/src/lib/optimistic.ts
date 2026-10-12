import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Optimistic UI infrastructure (roadmap Phase C / task O1).
 *
 * Produces the three React Query mutation callbacks an optimistic write needs,
 * so every future feature rolls back the same way instead of hand-rolling it:
 *
 * - `onMutate` cancels in-flight reads for the key *before* writing, so a late
 *   response can never clobber the optimistic value, and snapshots the current
 *   cache entry for rollback.
 * - Every write bumps a monotonic per-key token. `onError` only rolls back when
 *   its own write is still the newest one, so a slow, older failure can never
 *   overwrite a newer optimistic value.
 * - `onSettled` refetches the key so the cache reconciles with server truth.
 *
 * This module is pure infrastructure: it is not wired into any component yet.
 * Consumers spread the returned callbacks into a `useMutation` call:
 *
 * ```ts
 * const toggle = trpc.listings.toggle.useMutation({
 *   ...optimisticMutation<{ id: string }, Listing[]>({
 *     queryClient,
 *     queryKey: ["listings"],
 *     update: (current, input) => ...,
 *   }),
 *   mutationFn: input => toggleFn(input),
 * });
 * ```
 */

export interface OptimisticMutationContext<TData> {
  /** Cache value captured before the optimistic write; used for rollback. */
  previous: TData | undefined;
  /** Monotonic, per-query-key write token. The newest token owns the cache. */
  token: number;
  /** Stable identity of the targeted query key (see `optimisticKeyId`). */
  keyId: string;
}

export interface OptimisticMutationConfig<TInput, TData> {
  /** The client owning the cache entry to mutate. */
  queryClient: QueryClient;
  /** Query key holding the collection/entity being mutated. Matching is
   * prefix-based, mirroring `invalidateQueries`. */
  queryKey: QueryKey;
  /**
   * Pure reducer producing the optimistic next value from the cache and the
   * mutation input. Must never return `undefined` (React Query treats that as
   * "no change").
   */
  update: (current: TData | undefined, input: TInput) => TData;
  /** Called on every failure — for toasts / inline error surfaces. */
  onServerError?: (error: unknown, input: TInput) => void;
  /**
   * Refetch the key once the mutation settles so the cache reconciles with the
   * server. Defaults to `true`.
   */
  invalidateOnSettled?: boolean;
}

export interface OptimisticMutationCallbacks<TInput, TData> {
  onMutate: (input: TInput) => Promise<OptimisticMutationContext<TData>>;
  onError: (
    error: unknown,
    input: TInput,
    context: OptimisticMutationContext<TData> | undefined,
  ) => void;
  onSettled: (
    data: unknown,
    error: unknown,
    input: TInput,
    context: OptimisticMutationContext<TData> | undefined,
  ) => Promise<void>;
}

/** Per-client token registry: client -> (keyId -> latest write token). */
const tokens = new WeakMap<QueryClient, Map<string, number>>();

function tokenMap(queryClient: QueryClient): Map<string, number> {
  let map = tokens.get(queryClient);
  if (!map) {
    map = new Map<string, number>();
    tokens.set(queryClient, map);
  }
  return map;
}

/**
 * Stable identity for a query key. Query keys must be JSON-serializable, which
 * React Query already requires.
 */
export function optimisticKeyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

function bumpToken(queryClient: QueryClient, keyId: string): number {
  const map = tokenMap(queryClient);
  const token = (map.get(keyId) ?? 0) + 1;
  map.set(keyId, token);
  return token;
}

function latestToken(queryClient: QueryClient, keyId: string): number {
  return tokenMap(queryClient).get(keyId) ?? 0;
}

export function optimisticMutation<TInput, TData = unknown>(
  config: OptimisticMutationConfig<TInput, TData>,
): OptimisticMutationCallbacks<TInput, TData> {
  const {
    queryClient,
    queryKey,
    update,
    onServerError,
    invalidateOnSettled = true,
  } = config;
  const keyId = optimisticKeyId(queryKey);

  return {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);
      const token = bumpToken(queryClient, keyId);
      queryClient.setQueryData<TData>(queryKey, (current) =>
        update(current, input),
      );
      return { previous, token, keyId };
    },

    onError: (error, input, context) => {
      // Roll back only when this write is still the newest for the key: a stale
      // failure must never clobber a newer optimistic value.
      if (
        context &&
        latestToken(queryClient, context.keyId) === context.token
      ) {
        if (context.previous === undefined) {
          // Nothing was cached before the optimistic write — drop it so the
          // observers go back to their loading state.
          queryClient.removeQueries({ queryKey, exact: true });
        } else {
          queryClient.setQueryData<TData>(queryKey, context.previous);
        }
      }
      onServerError?.(error, input);
    },

    onSettled: async () => {
      if (invalidateOnSettled) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}
