import { describe, it, expect } from 'vitest';
import {
  getListingDetailKey,
  getSearchCacheKey,
  getCategoryCacheKey,
  getCityCacheKey,
  getFeaturedListingsKey,
  getRecentListingsKey,
  getAllListingsKey,
  getOwnerListingsPattern,
} from '../_core/cache';

describe('Cache Key Generation', () => {
  it('should generate listing detail key correctly', () => {
    expect(getListingDetailKey(123)).toBe('listings:detail:123');
    expect(getListingDetailKey('abc')).toBe('listings:detail:abc');
  });

  it('should generate search cache key deterministically', () => {
    const params1 = {
      city: 'Casablanca',
      category: 'car',
      minPrice: 100,
      maxPrice: 500,
      featured: false,
      available: true,
      query: '',
      limit: 20,
      offset: 0,
    };

    const params2 = {
      city: 'Casablanca',
      category: 'car',
      minPrice: 100,
      maxPrice: 500,
      featured: false,
      available: true,
      query: '',
      limit: 20,
      offset: 0,
    };

    const key1 = getSearchCacheKey(params1);
    const key2 = getSearchCacheKey(params2);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^listings:search:[a-z0-9]+$/);
  });

  it('should generate different keys for different params', () => {
    const params1 = { city: 'Casablanca', category: 'car' };
    const params2 = { city: 'Rabat', category: 'car' };

    const key1 = getSearchCacheKey(params1);
    const key2 = getSearchCacheKey(params2);
    expect(key1).not.toBe(key2);
  });

  it('should generate category cache key correctly', () => {
    expect(getCategoryCacheKey('car')).toBe('listings:category:car');
    expect(getCategoryCacheKey('car', { featured: true, limit: 10 })).toBe('listings:category:car?featured=true&limit=10');
  });

  it('should generate city cache key correctly', () => {
    expect(getCityCacheKey('Casablanca')).toBe('listings:city:Casablanca?city=Casablanca');
    expect(getCityCacheKey('Rabat', { category: 'property', featured: true })).toBe('listings:city:Rabat?city=Rabat&category=property&featured=true');
  });

  it('should generate featured listings key', () => {
    expect(getFeaturedListingsKey()).toBe('listings:featured');
  });

  it('should generate recent listings key with limit', () => {
    expect(getRecentListingsKey(20)).toBe('listings:recent:20');
    expect(getRecentListingsKey(50)).toBe('listings:recent:50');
  });

  it('should generate all listings key', () => {
    expect(getAllListingsKey()).toBe('listings:search:all');
    expect(getAllListingsKey({ status: 'Published', limit: 50 })).toBe('listings:search:all?status=Published&limit=50');
  });

  it('should generate owner listings pattern for invalidation', () => {
    expect(getOwnerListingsPattern(123)).toBe('listings:owner:123:*');
    expect(getOwnerListingsPattern('owner-456')).toBe('listings:owner:owner-456:*');
  });
});
