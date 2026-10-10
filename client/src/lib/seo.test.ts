import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE, TITLE_SUFFIX, formatTitle, serializeJsonLd } from "./seo";

describe("formatTitle", () => {
  it("appends the brand suffix to a bare title", () => {
    expect(formatTitle("نتائج البحث")).toBe("نتائج البحث | ALTUSplace");
  });

  it("does not double-append a suffix the caller already wrote", () => {
    expect(formatTitle("نتائج البحث | ALTUSplace")).toBe(
      "نتائج البحث | ALTUSplace"
    );
  });

  it("falls back to the site default when no title is passed", () => {
    expect(formatTitle()).toBe(DEFAULT_TITLE);
    expect(formatTitle(undefined)).toBe(DEFAULT_TITLE);
    expect(formatTitle(null)).toBe(DEFAULT_TITLE);
    expect(formatTitle("")).toBe(DEFAULT_TITLE);
    expect(formatTitle("   ")).toBe(DEFAULT_TITLE);
  });

  it("trims surrounding whitespace before appending", () => {
    expect(formatTitle("  كراء السيارات  ")).toBe("كراء السيارات | ALTUSplace");
  });

  it("honors a custom suffix", () => {
    expect(formatTitle("Car Rental", " — ALTUSplace")).toBe(
      "Car Rental — ALTUSplace"
    );
  });

  it("keeps the default title free of a duplicated suffix", () => {
    expect(DEFAULT_TITLE.endsWith(TITLE_SUFFIX)).toBe(true);
    expect(formatTitle(DEFAULT_TITLE)).toBe(DEFAULT_TITLE);
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so a </script> in dynamic content cannot break out of the script block", () => {
    const serialized = serializeJsonLd({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "</script><script>alert(1)</script>",
    });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });

  it("remains valid JSON that round-trips to the original entry", () => {
    const entry = {
      "@context": "https://schema.org",
      "@type": "Offer",
      priceCurrency: "MAD",
      price: 400,
      availability: "https://schema.org/InStock",
      validFrom: "2026-10-11",
      priceValidUntil: "2026-10-16",
    };
    expect(JSON.parse(serializeJsonLd(entry))).toEqual(entry);
  });

  it("serializes nested structures (aggregateRating) unchanged", () => {
    const entry = {
      "@context": "https://schema.org",
      "@type": "Product",
      aggregateRating: { "@type": "AggregateRating", ratingValue: 4.8, reviewCount: 12 },
    };
    expect(JSON.parse(serializeJsonLd(entry))).toEqual(entry);
  });
});
