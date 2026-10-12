/**
 * Locale-parity guard for the CatalogShowcase copy and the Featured Cars empty
 * state.
 *
 * Section A moved the last hardcoded Arabic strings out of
 * `CatalogShowcase.tsx` into i18n keys, and Section C added the Featured Cars
 * empty state. `translations` is typed
 * `Record<Language, Record<string, string>>`, so TypeScript cannot catch a key
 * added to `ar` and forgotten in `fr`/`en`. This test reads the raw per-locale
 * maps (no en -> ar -> key fallback) so a missing translation fails here instead
 * of silently rendering English inside the Arabic page.
 */
import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  TRANSLATION_KEYS_FOR_TEST,
  getTranslation,
} from "./LanguageContext";

/**
 * Keys introduced by the CatalogShowcase i18n extraction (Sections A/B) and the
 * Featured Cars empty state (Section C).
 */
const CATALOG_KEYS = [
  "catalogBadge",
  "catalogTitle",
  "catalogSubtitle",
  "catalogTypeCar",
  "catalogTypeProperty",
  "catalogViewDetails",
  "seatsShort",
  "roomsShort",
  "floorShort",
  "noCarsYet",
] as const;

describe("CatalogShowcase i18n", () => {
  it.each(CATALOG_KEYS)(
    "defines %s in every locale with a non-empty value",
    (key) => {
      for (const language of SUPPORTED_LANGUAGES) {
        const value = TRANSLATION_KEYS_FOR_TEST[language][key];
        expect(value, `${key} missing in ${language}`).toBeTruthy();
        // Raw-map read (no fallback) so a partial locale is caught here.
        expect(value, `${key} unresolved in ${language}`).not.toBe(key);
      }
    }
  );

  it("pins the exact Arabic wording (a reword is a UX change)", () => {
    const expectedAr: Record<(typeof CATALOG_KEYS)[number], string> = {
      catalogBadge: "كتالوج 2026",
      catalogTitle: "أحدث عروض كتالوج ALTUSplace",
      catalogSubtitle:
        "شقة معتمدة للكراء اليومي وسيارات 2026 محدثة — مواقع دقيقة ومواصفات دقيقة وصور حية.",
      catalogTypeCar: "سيارة",
      catalogTypeProperty: "عقار",
      catalogViewDetails: "عرض التفاصيل والحجز",
      seatsShort: "مقاعد",
      roomsShort: "غرف",
      floorShort: "الطابق",
      noCarsYet: "لم نجد سيارات متاحة حالياَ",
    };
    for (const key of CATALOG_KEYS) {
      expect(getTranslation("ar", key)).toBe(expectedAr[key]);
    }
  });
});
