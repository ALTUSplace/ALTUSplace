import { describe, expect, it } from "vitest";
import {
  MAX_ANNOUNCEMENT_LENGTH,
  normalizeAnnouncement,
  pageNameFromTitle,
  toComparablePath,
} from "./routeAnnouncement";

describe("normalizeAnnouncement", () => {
  it("returns an empty string for unusable input so live regions are never blanked", () => {
    expect(normalizeAnnouncement(null)).toBe("");
    expect(normalizeAnnouncement(undefined)).toBe("");
    expect(normalizeAnnouncement("")).toBe("");
    expect(normalizeAnnouncement("   \n\t ")).toBe("");
    expect(normalizeAnnouncement("— · |")).toBe("");
  });

  it("strips decorative separators and collapses whitespace", () => {
    expect(normalizeAnnouncement("  كراء السيارات — الدار البيضاء  ")).toBe("كراء السيارات الدار البيضاء");
    expect(normalizeAnnouncement("شقق للكراء | مراكش")).toBe("شقق للكراء مراكش");
    expect(normalizeAnnouncement("الرئيسية\n\n  الرئيسية")).toBe("الرئيسية الرئيسية");
  });

  it("truncates runaway headings with an ellipsis", () => {
    const long = "أ".repeat(MAX_ANNOUNCEMENT_LENGTH + 40);
    const result = normalizeAnnouncement(long);
    expect(result).toHaveLength(MAX_ANNOUNCEMENT_LENGTH);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("leaves ordinary headings untouched", () => {
    expect(normalizeAnnouncement("سياسة الخصوصية")).toBe("سياسة الخصوصية");
    expect(normalizeAnnouncement("Politique de confidentialité")).toBe("Politique de confidentialité");
  });
});

describe("pageNameFromTitle", () => {
  it("drops the site-name suffix useSEO appends", () => {
    expect(pageNameFromTitle("سياسة الخصوصية | ALTUSplace")).toBe("سياسة الخصوصية");
    expect(pageNameFromTitle("Conditions d'utilisation | ALTUSplace")).toBe("Conditions d'utilisation");
  });

  it("keeps a suffix-free title intact", () => {
    expect(pageNameFromTitle("من نحن")).toBe("من نحن");
  });

  it("degrades to an empty string when there is no title", () => {
    expect(pageNameFromTitle("")).toBe("");
    expect(pageNameFromTitle(null)).toBe("");
  });
});

describe("toComparablePath", () => {
  it("collapses trailing slashes, query strings and hashes", () => {
    expect(toComparablePath("/about/")).toBe("/about");
    expect(toComparablePath("/search?city=casablanca")).toBe("/search");
    expect(toComparablePath("/property/12#gallery")).toBe("/property/12");
    expect(toComparablePath("/locations/city/#x")).toBe("/locations/city");
  });

  it("normalises the root and bare segments", () => {
    expect(toComparablePath("/")).toBe("/");
    expect(toComparablePath("//")).toBe("/");
    expect(toComparablePath("about")).toBe("/about");
    expect(toComparablePath("")).toBe("/");
  });

  it("treats trailing-slash variants as the same page", () => {
    expect(toComparablePath("/about")).toBe(toComparablePath("/about/"));
  });
});