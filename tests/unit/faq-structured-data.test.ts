import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAQ_KEYS, buildFaqJsonLd } from "@/lib/faq";

/**
 * Group H guards.
 *
 * 1. The FAQPage JSON-LD has to describe exactly the questions and answers a
 *    visitor can read on the home page (Google requires FAQ structured data to
 *    match on-page content).
 * 2. Per-locale hreflang must stay off while every language shares one URL:
 *    docs/SEO_PLAN.md locks localization to the locale-subpath phase and
 *    forbids "hreflang for a URL that is not reachable and canonical".
 */

const readRepo = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const FAQ_SECTION = readRepo("client/src/components/FAQSection.tsx");
const SEO = readRepo("client/src/lib/seo.ts");
const INDEX_HTML = readRepo("client/index.html");
const PRERENDER = readRepo("scripts/prerender.mjs");

/** Stand-in for the i18n `t`, so a hard-coded answer cannot pass unnoticed. */
const echo = (key: string) => `<<${key}>>`;

/**
 * True when a component keeps every answer in the DOM (toggled with `hidden`)
 * rather than unmounting the collapsed ones behind `{isOpen && ...}`.
 */
export function rendersAllAnswers(src: string): boolean {
  return !/\{\s*isOpen\s*&&/.test(src) && /hidden=\{!isOpen\}/.test(src);
}

/**
 * Every hreflang a `seo.ts` source passes to `upsertLink("alternate", url, tag)`.
 * Reads the call, not a literal tag, so a locale handed in as an argument is
 * caught too.
 */
export function alternateHreflangs(src: string): string[] {
  return [...src.matchAll(/upsertLink\(\s*"alternate"\s*,\s*[^,]+,\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
}

describe("home FAQ structured data", () => {
  it("emits one Question per FAQ, in list order, from the i18n lookup", () => {
    const schema = buildFaqJsonLd(echo);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(FAQ_KEYS.length);
    expect(schema.mainEntity.map((q) => q.name)).toEqual(FAQ_KEYS.map((f) => `<<${f.questionKey}>>`));
    expect(schema.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(FAQ_KEYS.map((f) => `<<${f.answerKey}>>`));
  });

  it("uses four distinct questions and answers", () => {
    expect(FAQ_KEYS).toHaveLength(4);
    expect(new Set(FAQ_KEYS.map((f) => f.questionKey)).size).toBe(FAQ_KEYS.length);
    expect(new Set(FAQ_KEYS.map((f) => f.answerKey)).size).toBe(FAQ_KEYS.length);
  });

  it("drives the visible accordion and the schema from the same list", () => {
    expect(FAQ_SECTION).toContain("FAQ_KEYS");
    expect(FAQ_SECTION).toContain("buildFaqJsonLd");
    expect(FAQ_SECTION).toContain("renderJsonLd");
    // Removed on unmount so the FAQ never leaks onto another route.
    expect(FAQ_SECTION).toContain("getElementById(FAQ_JSONLD_ID)?.remove()");
  });

  it("keeps every answer in the DOM so the schema matches the page", () => {
    expect(rendersAllAnswers(FAQ_SECTION)).toBe(true);
  });
});

describe("single-URL language model guards", () => {
  it("emits exactly one alternate, x-default, regardless of language", () => {
    // Every language shares one URL, so an ar-MA / fr-MA / en-GB alternate here
    // would point at the same document and be ignored at best.
    expect(alternateHreflangs(SEO)).toEqual(["x-default"]);
  });

  it("ships no per-locale hreflang in the static or prerendered head", () => {
    expect(INDEX_HTML).not.toMatch(/hreflang="(?!x-default)/);
    // seo.ts actively drops any per-locale alternate it finds...
    expect(SEO).toContain('not([hreflang="x-default"])');
    // ...and the prerenderer strips hreflang tags from the template before
    // re-injecting the single x-default.
    expect(PRERENDER).toContain('rel="(?:canonical|alternate)"');
  });
});

/**
 * Falsification fixtures for the DOM-shape check, so the day the accordion
 * reverts to unmounting answers, the guard says so.
 */
describe("FAQ DOM-shape analyzer", () => {
  it("rejects an unmounted collapsed answer", () => {
    expect(rendersAllAnswers(`{isOpen && (<div>{t('faqAnswer1')}</div>)}`)).toBe(false);
  });

  it("accepts an answer toggled with hidden", () => {
    expect(rendersAllAnswers(`<div hidden={!isOpen}>{t('faqAnswer1')}</div>`)).toBe(true);
  });

  it("rejects a component that does neither", () => {
    expect(rendersAllAnswers(`<div>{t('faqAnswer1')}</div>`)).toBe(false);
  });

  it("reads a locale passed as an argument, not just a literal tag", () => {
    expect(alternateHreflangs(`upsertLink("alternate", canonical, "fr-MA");`)).toEqual(["fr-MA"]);
    expect(alternateHreflangs(`upsertLink("alternate", canonical, "x-default");`)).toEqual(["x-default"]);
    // A canonical link must not be mistaken for an alternate.
    expect(alternateHreflangs(`upsertLink("canonical", canonical);`)).toEqual([]);
  });
});
