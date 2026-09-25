import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPropertyCategory, isCarCategory } from "../client/src/lib/categories";

/**
 * server/demoSeed.ts runs on boot when the listings table is empty, so its rows
 * are the first thing a visitor can see. Its copy is asserted here (by reading
 * the source) because the module performs DB I/O on import.
 */
const source = readFileSync(resolve(import.meta.dirname, "demoSeed.ts"), "utf8");

const ARTIFACTS = ["Shuqqa", "Shaqqa", "m'uaththatha", "mu'aththatha", "ghuraf", "ghurfatan"];

/** Strips block/line comments so prose mentions of French districts don't trip the assertions. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("demo seed copy", () => {
  it("contains no transliterated-Arabic artifacts", () => {
    for (const artifact of ARTIFACTS) {
      expect(code, `demoSeed.ts still contains "${artifact}"`).not.toContain(artifact);
    }
  });

  it("renders Arabic seed titles with Arabic script", () => {
    const titles = [...source.matchAll(/^\s*title:\s*"(.*)",\s*$/gm)].map((m) => m[1]);
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title, `seed title "${title}" is not Arabic script`).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it("uses official Arabic city names", () => {
    expect(code).toContain("الدار البيضاء");
    expect(code).not.toMatch(/city:\s*"[^"]*Casablanca/i);
  });

  it("classifies its apartment rows as property, not vehicle", () => {
    // Regression guard: the old "Shaqqa / Appartement" category string did not
    // match PROPERTY_HINTS, so these apartments were treated as cars.
    expect(isPropertyCategory("شقة")).toBe(true);
    expect(isCarCategory("شقة")).toBe(false);
    expect(isCarCategory("Shaqqa / Appartement")).toBe(true); // documents the old bug
    expect(code).toContain('category: "شقة"');
  });
});
