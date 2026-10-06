import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H2 regression guards (mobile horizontal overflow, 375px).
 *
 * The ~212px phantom horizontal scrollbar at 375px was traced (verified in
 * Chromium) to two uncontained RTL inline-start bleeds:
 *
 *  1. The seasonal-destination pill rail (`RegionalHighlights.tsx`). Chrome
 *     folds a descendant horizontal scroll container's inline-start scrollable
 *     overflow into the DOCUMENT's scrollWidth even when an ancestor has
 *     `overflow-x: clip`; only paint containment on the scroll container
 *     (`contain-paint` on the <ul>) removes it while keeping the rail scrollable.
 *  2. The search results toolbar (`Search.tsx`). Its controls row overflows its
 *     card by 17px in RTL at 375px, pushing the sort <select> to `left:-17`.
 *     `flex-wrap` lets the row reflow instead of bleeding off-canvas.
 *
 * These tests assert the fix stays on the exact elements that need it, so a
 * future refactor cannot silently reintroduce the bleed.
 */
describe("mobile horizontal-overflow guards (H2)", () => {
  const highlightsSource = readFileSync(
    resolve(import.meta.dirname, "components", "RegionalHighlights.tsx"),
    "utf8",
  );
  const searchSource = readFileSync(
    resolve(import.meta.dirname, "pages", "Search.tsx"),
    "utf8",
  );

  it("keeps paint containment on the seasonal pill-rail <ul> itself", () => {
    // The containment must live on the scroll container (the <ul>), not merely
    // on an ancestor wrapper — Chrome does not contain a descendant scroll
    // container's inline-start overflow via ancestor clipping.
    // NB: match the `className` attribute, not a bare `<ul>` — the JSX comment
    // above also contains the literal text "<ul>".
    const ulClass = highlightsSource.match(/<ul\b[^>]*?className="([^"]*)"/)?.[1];
    expect(ulClass).toBeTruthy();
    expect(ulClass).toMatch(/overflow-x-auto/);
    expect(ulClass).toMatch(/contain-paint/);
  });

  it("keeps the search toolbar controls row wrappable", () => {
    // The controls row (view toggle + sort <select>) overflows its card by 17px
    // in RTL at 375px; without `flex-wrap` the sort select bleeds off-canvas.
    expect(searchSource).toMatch(
      /className="flex flex-wrap items-center gap-3 w-full sm:w-auto"/,
    );
  });
});