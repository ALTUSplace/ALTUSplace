/**
 * B2-Rent brand configuration — single source of truth for brand identity,
 * shared storage keys, and the functional support inbox.
 */

export const BRAND_NAME = "B2-Rent";
export const BRAND_TAGLINE = "Rent. Drive. Live.";

/** Functional support inbox (operational address — change here when it moves). */
export const SUPPORT_EMAIL = "b2rent@gmail.com";

/** Client-side storage keys, namespaced under the current brand. */
export const STORAGE_KEYS = {
  language: "b2rent-language",
  currency: "b2rent_currency",
  notificationSound: "b2rent-notification-sound",
  favorites: "b2rent_favorites",
  recentViewed: "b2rent_recent_viewed",
} as const;

export type BrandPreferenceKey = keyof typeof STORAGE_KEYS;

/** Pre-rebrand keys migrated transparently on first read so no preference is lost. */
const LEGACY_STORAGE_KEYS: Record<BrandPreferenceKey, readonly string[]> = {
  language: ["b2rent-language"],
  currency: ["b2rent_currency"],
  notificationSound: ["b2rent-notification-sound"],
  favorites: ["b2_favorites", "b2rent_favorites"],
  recentViewed: ["b2rent_recent_viewed"],
};

/**
 * Reads a brand-scoped preference, transparently migrating values saved under
 * legacy keys. Returns null when unset or when storage is unavailable.
 */
export function readBrandPreference(key: BrandPreferenceKey): string | null {
  if (typeof window === "undefined") return null;
  try {
    const current = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (current !== null) return current;
    for (const legacyKey of LEGACY_STORAGE_KEYS[key]) {
      const legacyValue = window.localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        window.localStorage.setItem(STORAGE_KEYS[key], legacyValue);
        window.localStorage.removeItem(legacyKey);
        return legacyValue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Writes a brand-scoped preference. Fails silently when storage is unavailable. */
export function writeBrandPreference(key: BrandPreferenceKey, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    // Storage unavailable (private mode) — preference becomes session-only.
  }
}

/** Client-side event fired after the platform-protection consent is accepted. */
export const LEGAL_CONSENT_EVENT = "b2rent:legal-consent";

/** Cookie that records the accepted platform-protection consent version. */
export const LEGAL_CONSENT_COOKIE = "b2_legal_consent";
