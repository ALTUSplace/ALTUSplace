/**
 * Cache Middleware for tRPC
 *
 * Provides caching capabilities for tRPC procedures using Redis.
 * Implements the Cache-Aside Pattern for read-heavy endpoints.
 */

import { TRPCError } from "@trpc/server";
import {
  cacheGet,
  cacheSet,
  getListingDetailKey,
  getSearchCacheKey,
  getAllListingsKey,
  getFeaturedListingsKey,
  getCategoryCacheKey,
  getCityCacheKey,
  invalidateListingCache,
  isRedisAvailable,
} from "./cache";
import { ENV } from "./env";

/**
 * Cache configuration for a procedure
 */
export interface CacheConfig<TInput = unknown, TOutput = unknown> {
  /**
   * Generate a cache key from the input
   */
  keygen: (input: TInput) => string;

  /**
   * Time-to-live in seconds
   */
  ttl?: number;

  /**
   * Whether to enable caching for this procedure
   */
  enabled?: boolean;

  /**
   * Custom serialization for cache storage
   */
  serialize?: (data: TOutput) => string;

  /**
   * Custom deserialization from cache storage
   */
  deserialize?: (data: string) => TOutput;
}

/**
 * Create a cache-enabled procedure wrapper
 */
export function createCacheMiddleware<TInput, TOutput>(
  config: CacheConfig<TInput, TOutput>
) {
  return async (opts: {
    input: TInput;
    ctx: { user: unknown };
    next: () => Promise<TOutput>;
  }) => {
    const { input, next } = opts;

    if (!isRedisAvailable() || !ENV.redisEnabled || !config.enabled) {
      return next();
    }

    const cacheKey = config.keygen(input);
    const ttl = config.ttl ?? 300;

    try {
      const cached = await cacheGet<TOutput>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const result = await next();
      await cacheSet(cacheKey, result, ttl);

      return result;
    } catch (error) {
      console.error("[CacheMiddleware] Error:", error);
      return next();
    }
  };
}
