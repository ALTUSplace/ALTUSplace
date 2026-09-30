import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE, TITLE_SUFFIX, formatTitle } from "./seo";

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
