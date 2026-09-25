import { describe, expect, it } from "vitest";
import {
  getDirectionForLanguage,
  getLocaleForLanguage,
  getTranslation,
  SUPPORTED_LANGUAGES,
  TRANSLATION_KEYS_FOR_TEST,
} from "./LanguageContext";

describe("LanguageContext i18n helpers", () => {
  it("supports Arabic, French, and English without a page reload", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["ar", "fr", "en"]);
    expect(getDirectionForLanguage("ar")).toBe("rtl");
    expect(getDirectionForLanguage("fr")).toBe("ltr");
    expect(getDirectionForLanguage("en")).toBe("ltr");
  });

  it("maps languages to Moroccan-friendly locales", () => {
    expect(getLocaleForLanguage("ar")).toBe("ar-MA");
    expect(getLocaleForLanguage("fr")).toBe("fr-MA");
    expect(getLocaleForLanguage("en")).toBe("en-GB");
  });

  it("falls back to English, then Arabic, then the key", () => {
    expect(getTranslation("en", "heroTitle")).toBe("Your trusted gateway to car rentals in Morocco");
    expect(getTranslation("en", "missing.key")).toBe("missing.key");
  });

  it("provides localized values for every shared footer label", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getTranslation(language, "termsOfService")).not.toBe("termsOfService");
      expect(getTranslation(language, "readTermsAndAgree")).not.toBe("readTermsAndAgree");
    }
  });

  it("defines the same key set in every locale so no call falls back to English", () => {
    const enKeys = Object.keys(TRANSLATION_KEYS_FOR_TEST.en).sort();
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(TRANSLATION_KEYS_FOR_TEST[language]).sort()).toEqual(enKeys);
    }
  });

  it("never leaks a Latin-script English or French string into the Arabic dictionary", () => {
    // Brand names, acronyms and {placeholders} are the only allowed Latin runs.
    const allowed = /^(ALTUSplace|SSL|CMI|MAD|WiFi|WhatsApp|Booking|Airbnb|iCal)$/;
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(TRANSLATION_KEYS_FOR_TEST.ar)) {
      // Placeholders are interpolation contracts, not untranslated copy.
      const withoutPlaceholders = value.replace(/\{[a-zA-Z0-9_]+\}/g, "");
      for (const run of withoutPlaceholders.match(/[A-Za-z][A-Za-z0-9.]*/g) ?? []) {
        if (!allowed.test(run)) offenders.push(`${key} -> "${run}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every Arabic value free of transliterated-Arabic seed artifacts", () => {
    const artifacts = ["Shuqqa", "Shaqqa", "m'uaththatha", "mu'aththatha", "ghuraf", "ghurfatan"];
    for (const [key, value] of Object.entries(TRANSLATION_KEYS_FOR_TEST.ar)) {
      for (const artifact of artifacts) {
        expect(value, `${key} contains "${artifact}"`).not.toContain(artifact);
      }
    }
  });
});
