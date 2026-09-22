import { describe, expect, it } from "vitest";
import { getTranslation, SUPPORTED_LANGUAGES, type Language } from "./LanguageContext";

describe("partner-verified badge i18n", () => {
  it("provides a localized badge label in all 3 locales", () => {
    const expected: Record<Language, string> = {
      ar: "وكالة موثقة",
      fr: "Agence vérifiée",
      en: "Verified partner",
    };
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getTranslation(language, "partnerVerified")).toBe(expected[language]);
    }
  });
});