/**
 * Redis Caching Layer for High-Traffic Listings
 *
 * Implements the Cache-Aside Pattern for read-heavy data (Properties and Cars).
 * Search queries hit the cache layer before querying the primary database to
 * achieve sub-100ms response times.
 *
 * Cache Invalidation Strategy:
 * - Manual invalidation: Explicitly called after mutations
 * - TTL-based expiry: Configurable per cache type
 * - Pattern-based invalidation: For bulk operations (e.g., all listings by owner)
 */

import { Redis } from "@upstash/redis";
import { ENV } from "./env";

// Cache key prefixes
const PREFIXES = {
  LISTING_DETAIL: "listings:detail:",
  LISTING_SEARCH: "listings:search:",
  LISTINGS_CATEGORY: "listings:category:",
  LISTINGS_CITY: "listings:city:",
  LISTINGS_OWNER: "listings:owner:",
  LISTINGS_FEATURED: "listings:featured",
  LISTINGS_RECENT: "listings:recent",
  LISTING_SEARCH_ALL: "listings:search:all",
} as const;

// Default TTLs in seconds
const DEFAULT_TTLS = {
  DETAIL: 300,
  SEARCH: 120,
  CATEGORY: 600,
  CITY: 600,
  FEATURED: 900,
  RECENT: 600,
  SEARCH_ALL: 120,
} as const;

// Singleton Redis client
let redisClient: Redis | null = null;
let redisMetrics: { hits: number; misses: number; errors: number } = {
  hits: 0,
  misses: 0,
  errors: 0,
};

export function getRedisClient(): Redis | null {
  if (!redisClient && ENV.redisUrl && ENV.redisToken) {
    try {
      redisClient = new Redis({
        url: ENV.redisUrl,
        token: ENV.redisToken,
      });
    } catch (error) {
      console.error("[Redis] Failed to initialize Redis client:", error);
      return null;
    }
  }
  return redisClient;
}

export function isRedisAvailable(): boolean {
  return ENV.redisEnabled && getRedisClient() !== null;
}

export function getListingDetailKey(listingId: number | string): string {
  return `${PREFIXES.LISTING_DETAIL}${listingId}`;
}

export function getSearchCacheKey(params: {
  city?: string | null;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  featured?: boolean | null;
  available?: boolean | null;
  query?: string | null;
  limit?: number;
  offset?: number;
}): string {
  const { city, category, minPrice, maxPrice, featured, available, query, limit = 50, offset = 0 } = params;
  const paramString = JSON.stringify({
    city: city ?? "",
    category: category ?? "",
    minPrice: minPrice ?? 0,
    maxPrice: maxPrice ?? 999999,
    featured: featured ?? false,
    available: available ?? false,
    query: query ?? "",
    limit,
    offset,
    timeBucket: Math.floor(Date.now() / (15 * 60 * 1000)),
  });
  let hash = 0;
  for (let i = 0; i < paramString.length; i++) {
    const char = paramString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36);
  return `${PREFIXES.LISTING_SEARCH}${hashStr}`;
}

export function getCategoryCacheKey(
  category: string,
  options?: { featured?: boolean; limit?: number }
): string {
  const suffix = options
    ? `?featured=${options.featured ?? false}&limit=${options.limit ?? 50}`
    : "";
  return `${PREFIXES.LISTINGS_CATEGORY}${category}${suffix}`;
}

export function getCityCacheKey(
  city: string,
  options?: { category?: string; featured?: boolean; limit?: number }
): string {
  const parts = [`city=${city}`];
  if (options?.category) parts.push(`category=${options.category}`);
  if (options?.featured !== undefined) parts.push(`featured=${options.featured}`);
  if (options?.limit) parts.push(`limit=${options.limit}`);
  const suffix = `?${parts.join("&")}`;
  return `${PREFIXES.LISTINGS_CITY}${city}${suffix}`;
}

export function getFeaturedListingsKey(): string {
  return PREFIXES.LISTINGS_FEATURED;
}

export function getRecentListingsKey(limit: number = 20): string {
  return `${PREFIXES.LISTINGS_RECENT}:${limit}`;
}

export function getAllListingsKey(options?: { status?: string; limit?: number }): string {
  const suffix = options
    ? `?status=${options.status ?? "Published"}&limit=${options.limit ?? 100}`
    : "";
  return `${PREFIXES.LISTING_SEARCH_ALL}${suffix}`;
}

export function getOwnerListingsPattern(ownerId: number | string): string {
  return `${PREFIXES.LISTINGS_OWNER}${ownerId}:*`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) return null;
  try {
    const client = getRedisClient();
    if (!client) return null;
    const value = await client.get<T>(key);
    if (value !== null) {
      redisMetrics.hits++;
      return value;
    }
    redisMetrics.misses++;
    return null;
  } catch (error) {
    redisMetrics.errors++;
    console.error(`[Redis] Cache get error for key ${key}:`, error);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTLS.DETAIL
): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  try {
    const client = getRedisClient();
    if (!client) return false;
    await client.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    redisMetrics.errors++;
    console.error(`[Redis] Cache set error for key ${key}:`, error);
    return false;
  }
}

export async function cacheDelete(key: string): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  try {
    const client = getRedisClient();
    if (!client) return false;
    await client.del(key);
    return true;
  } catch (error) {
    redisMetrics.errors++;
    console.error(`[Redis] Cache delete error for key ${key}:`, error);
    return false;
  }
}

export async function cacheDeleteByPattern(pattern: string): Promise<number> {
  if (!isRedisAvailable()) return 0;
  try {
    const client = getRedisClient();
    if (!client) return 0;
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    for (const key of keys) {
      await client.del(key);
    }
    return keys.length;
  } catch (error) {
    redisMetrics.errors++;
    console.error(`[Redis] Cache delete by pattern error for ${pattern}:`, error);
    return 0;
  }
}

export async function invalidateListingCache(listingId: number | string): Promise<void> {
  const id = String(listingId);
  await cacheDelete(getListingDetailKey(id));
}

export async function invalidateOwnerListingsCache(ownerId: number | string): Promise<number> {
  return cacheDeleteByPattern(getOwnerListingsPattern(ownerId));
}

export async function trackListingView(listingId: number): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    const client = getRedisClient();
    if (!client) return;
    await client.incr(`analytics:views:${listingId}`);
    await client.zadd("analytics:recentViews", {
      score: Date.now(),
      member: String(listingId),
    });
    await client.zrange("analytics:recentViews", 0, -1);
  } catch (error) {
    console.error("[Redis] Analytics tracking error:", error);
  }
}

export async function getCachedViewCount(listingId: number): Promise<number> {
  if (!isRedisAvailable()) return 0;
  try {
    const client = getRedisClient();
    if (!client) return 0;
    const count = await client.get<number>(`analytics:views:${listingId}`);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function getCacheMetrics(): {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number;
  isEnabled: boolean;
} {
  const total = redisMetrics.hits + redisMetrics.misses;
  const hitRate = total > 0 ? (redisMetrics.hits / total) * 100 : 0;
  return {
    hits: redisMetrics.hits,
    misses: redisMetrics.misses,
    errors: redisMetrics.errors,
    hitRate: Math.round(hitRate * 100) / 100,
    isEnabled: isRedisAvailable(),
  };
}

export function resetCacheMetrics(): void {
  redisMetrics = { hits: 0, misses: 0, errors: 0 };
}

export async function warmUpCache(): Promise<void> {
  if (!isRedisAvailable()) return;
  console.log("[Redis] Cache warmup started...");
  try {
    const featuredKey = getFeaturedListingsKey();
    const exists = await getRedisClient()?.get(featuredKey);
    if (!exists) {
      console.log("[Redis] Featured listings cache miss - will be populated on first request");
    }
  } catch (error) {
    console.error("[Redis] Cache warmup error:", error);
  }
}

// Cache Utility Functions
export async function getCachedListing<T>(
  listingId: number,
  fetchListing: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTLS.DETAIL
): Promise<T> {
  if (!isRedisAvailable() || !ENV.redisEnabled) {
    return fetchListing();
  }
  const cacheKey = getListingDetailKey(listingId);
  const cached = await cacheGet<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }
  const result = await fetchListing();
  await cacheSet(cacheKey, result, ttlSeconds);
  return result;
}

export async function getCachedSearchResults<T>(
  searchParams: {
    city?: string | null;
    category?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    featured?: boolean | null;
    available?: boolean | null;
    query?: string | null;
    limit?: number;
    offset?: number;
  },
  fetchSearch: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTLS.SEARCH
): Promise<T> {
  if (!isRedisAvailable() || !ENV.redisEnabled) {
    return fetchSearch();
  }
  const cacheKey = getSearchCacheKey(searchParams);
  const cached = await cacheGet<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }
  const result = await fetchSearch();
  await cacheSet(cacheKey, result, ttlSeconds);
  return result;
}
