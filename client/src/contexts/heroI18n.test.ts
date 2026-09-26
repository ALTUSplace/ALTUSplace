/**
 * Locale-parity guard for the photographic hero's new copy.
 *
 * The hero's step flow and category rail are the first surface where a missing
 * key is immediately visible — a `t()` miss renders the raw key string straight
 * into the middle of the headline block. `translations` is typed
 * `Record<Language, Record<string, string>>`, so TypeScript cannot catch a key
 * added to `ar` and forgotten in `fr`/`en`; this test can.
 *
 * It also pins the exact Arabic wording, because the step labels are a numbered
 * instruction flow and a reworded label is a UX change, not a copy tweak.
 */
import { describe, expect, it } from "vitest";
import { getTranslation, SUPPORTED_LANGUAGES, type Language } from "./LanguageContext";

/** Keys introduced with the hero redesign. */
const HERO_KEYS = [
  "heroStepType",
  "heroStepLocation",
  "heroStepSearch",
  "heroShowcaseBadge",
  "heroShowcaseTitle",
  "heroCatLuxuryCars",
  "heroCatFurnishedApts",
  "heroCatFamilyVillas",
] as const;

const EXPECTED_AR: Record<(typeof HERO_KEYS)[number], string> = {
  heroStepType: "اختر النوع",
  heroStepLocation: "حدد الموقع",
  heroStepSearch: "ابحث الآن",
  heroShowcaseBadge: "تصفح حسب الفئة",
  heroShowcaseTitle: "ابدأ من الفئة التي تناسبك",
  heroCatLuxuryCars: "سيارات فاخرة للكراء اليومي",
  heroCatFurnishedApts: "شقق مؤثثة للإيجار الشهري",
  heroCatFamilyVillas: "فللات عائلية للعطلات",
};

describe("hero redesign i18n", () => {
  it.each(HERO_KEYS)("resolves %s in every supported locale", (key) => {
    for (const language of SUPPORTED_LANGUAGES) {
      const value = getTranslation(language, key);
      expect(value, `${key} missing in ${language}`).toBeTruthy();
      // A miss returns the key itself; anything equal to the key is a gap.
      expect(value, `${key} unresolved in ${language}`).not.toBe(key);
    }
  });

  it("pins the Arabic step flow and category labels", () => {
    for (const key of HERO_KEYS) {
      expect(getTranslation("ar", key)).toBe(EXPECTED_AR[key]);
    }
  });

  it("keeps the three category labels distinct per locale", () => {
    // Guards against copy-paste collapsing two cards onto one label.
    const labels = ["heroCatLuxuryCars", "heroCatFurnishedApts", "heroCatFamilyVillas"] as const;
    for (const language of SUPPORTED_LANGUAGES as readonly Language[]) {
      const rendered = labels.map((key) => getTranslation(language, key));
      expect(new Set(rendered).size, `duplicate category label in ${language}`).toBe(labels.length);
    }
  });
});
