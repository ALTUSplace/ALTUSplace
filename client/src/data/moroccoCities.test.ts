import { describe, expect, it } from "vitest";
import { MOROCCAN_CITIES, MOROCCO_CITY_LABELS_FR, resolveCitySlug } from "@/data/moroccoCities";

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