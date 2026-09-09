import { describe, expect, it } from "vitest";
import {
  getDirectionForLanguage,
  getLocaleForLanguage,
  getTranslation,
  translations,
  translate,
  SUPPORTED_LANGUAGES,
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
    expect(getTranslation("en", "heroTitle")).toBe("Your trusted gateway to car and property rentals in Morocco");
    expect(getTranslation("en", "missing.key")).toBe("missing.key");
  });

  it("provides localized values for every shared footer label", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getTranslation(language, "termsOfService")).not.toBe("termsOfService");
      expect(getTranslation(language, "readTermsAndAgree")).not.toBe("readTermsAndAgree");
    }
  });

  it("keeps every translation dictionary in sync across all languages", () => {
    const arKeys = Object.keys(translations.ar).sort();
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(translations[language]).sort()).toEqual(arKeys);
    }
  });

  it("covers every key in the symmetric parity (no missing translations)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of Object.keys(translations.ar)) {
        const value = getTranslation(language, key);
        expect(value).not.toBe(key);
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates {{params}} in localized strings", () => {
    expect(translate("en", "viewAllListings", { count: 6 })).toBe("View all listings (6)");
    expect(translate("fr", "smartReasonCity", { city: "Agadir" })).toBe("Dans la ville que vous avez consultée : Agadir");
    expect(translate("ar", "currencySwitched", { currency: "EUR" })).toContain("EUR");
  });
});
