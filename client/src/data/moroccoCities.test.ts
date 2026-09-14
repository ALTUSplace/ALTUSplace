import { describe, expect, it } from "vitest";
import {
  MOROCCAN_CITIES,
  MOROCCO_REGIONS,
  MOROCCO_CITY_LABELS_FR,
  MOROCCO_CITY_SLUGS,
  cityFromSlug,
  slugForCity,
  matchListingCity,
  resolveCitySlug,
} from "@/data/moroccoCities";

describe("nationwide Moroccan cities module", () => {
  it("covers all major Moroccan cities across the twelve regions", () => {
    const major = [
      "الدار البيضاء",
      "الرباط",
      "مراكش",
      "فاس",
      "طنجة",
      "أغادير",
      "مكناس",
      "وجدة",
      "القنيطرة",
      "تطوان",
      "آسفي",
      "الناظور",
      "بني ملال",
      "العيون",
      "خريبكة",
      "الجديدة",
      "الحسيمة",
      "ورزازات",
      "الرشيدية",
      "كلميم",
      "الداخلة",
    ];
    for (const city of major) {
      expect(MOROCCAN_CITIES).toContain(city);
    }
    expect(MOROCCAN_CITIES.length).toBeGreaterThanOrEqual(50);
  });

  it("covers both the casablanca and agadir spellings the platform already uses", () => {
    expect(MOROCCAN_CITIES).toContain("الدار البيضاء");
    expect(MOROCCAN_CITIES).toContain("أغادير");
  });

  it("maps every city to a French label for the FR interface", () => {
    for (const city of MOROCCAN_CITIES) {
      expect(MOROCCO_CITY_LABELS_FR[city]).toBeTruthy();
    }
  });

  it("groups the nationwide list into the twelve administrative regions", () => {
    expect(MOROCCO_REGIONS.length).toBe(12);
    const flat = MOROCCO_REGIONS.flatMap((region) => region.cities);
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(MOROCCAN_CITIES.length);
    for (const city of MOROCCAN_CITIES) {
      expect(flat).toContain(city);
    }
  });

  it("gives every city a unique canonical latin slug", () => {
    const slugs = Object.values(MOROCCO_CITY_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBe(MOROCCAN_CITIES.length);
    for (const city of MOROCCAN_CITIES) {
      expect(MOROCCO_CITY_SLUGS[city]).toBeTruthy();
    }
  });

  it("round-trips slug -> city -> slug for every canonical slug", () => {
    for (const city of MOROCCAN_CITIES) {
      const slug = slugForCity(city);
      expect(slug).toBeTruthy();
      expect(cityFromSlug(slug)).toBe(city);
    }
  });

  it("resolves known latin, accent and french variants from landing slugs", () => {
    expect(cityFromSlug("casablanca")).toBe("الدار البيضاء");
    expect(cityFromSlug("agadir")).toBe("أغادير");
    expect(cityFromSlug("laayoune")).toBe("العيون");
    expect(cityFromSlug("fès")).toBe("فاس");
    expect(cityFromSlug("oujda")).toBe("وجدة");
    expect(cityFromSlug("الرباط")).toBe("الرباط");
    expect(cityFromSlug("beni-mellal")).toBe("بني ملال");
    expect(cityFromSlug("al-hoceima")).toBe("الحسيمة");
  });

  it("rejects unknown, empty and all-placeholder slugs", () => {
    expect(cityFromSlug("")).toBeNull();
    expect(cityFromSlug("all")).toBeNull();
    expect(cityFromSlug("الكل")).toBeNull();
    expect(cityFromSlug("somewhere-unknown")).toBeNull();
  });

  it("matches listing cities regardless of spelling variant", () => {
    expect(matchListingCity("الدار البيضاء", "Casablanca")).toBe(true);
    expect(matchListingCity("casablanca", "الدار البيضاء")).toBe(true);
    expect(matchListingCity("أكادير", "أغادير")).toBe(true);
    expect(matchListingCity("Fès", "فاس")).toBe(true);
    expect(matchListingCity("مراكش", "marrakech")).toBe(true);
    expect(matchListingCity("الرباط", "طنجة")).toBe(false);
    expect(matchListingCity("", "الرباط")).toBe(false);
    expect(matchListingCity(undefined, "الرباط")).toBe(false);
  });

  it("resolves latin slugs, french names, and arabic names to the canonical arabic city", () => {
    expect(resolveCitySlug("casablanca")).toBe("الدار البيضاء");
    expect(resolveCitySlug("Casablanca")).toBe("الدار البيضاء");
    expect(resolveCitySlug("Marrakech")).toBe("مراكش");
    expect(resolveCitySlug("agadir")).toBe("أغادير");
    expect(resolveCitySlug("tanger")).toBe("طنجة");
    expect(resolveCitySlug("fès")).toBe("فاس");
    expect(resolveCitySlug("meknes")).toBe("مكناس");
    expect(resolveCitySlug("oujda")).toBe("وجدة");
    expect(resolveCitySlug("laayoune")).toBe("العيون");
    expect(resolveCitySlug("الرباط")).toBe("الرباط");
  });

  it("normalizes empty or 'all' values to the all-cities placeholder", () => {
    expect(resolveCitySlug("")).toBe("all");
    expect(resolveCitySlug("all")).toBe("all");
    expect(resolveCitySlug("الكل")).toBe("all");
    expect(resolveCitySlug("جميع المدن")).toBe("all");
  });
});