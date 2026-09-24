import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRouteMetadata } from "./_core/prerender";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

const LEGAL_PAGES = [
  {
    route: "/conditions-utilisation",
    component: "ConditionsUtilisation",
    md: "legal/conditions-utilisation.md",
    heading: "شروط الاستخدام",
    title: "شروط الاستخدام | ALTUSplace",
    file: "conditions-utilisation/index.html",
  },
  {
    route: "/politique-confidentialite",
    component: "PolitiqueConfidentialite",
    md: "legal/politique-confidentialite.md",
    heading: "سياسة الخصوصية",
    title: "سياسة الخصوصية | ALTUSplace",
    file: "politique-confidentialite/index.html",
  },
  {
    route: "/mentions-legales",
    component: "MentionsLegales",
    md: "legal/mentions-legales.md",
    heading: "الإعلان القانوني",
    title: "الإعلان القانوني | ALTUSplace",
    file: "mentions-legales/index.html",
  },
];

describe("legal pages audit", () => {
  it.each(LEGAL_PAGES)("prerenders $route with Arabic metadata (serves 200 at build)", ({ route, file, title }) => {
    const prerender = read("scripts/prerender.mjs");
    expect(prerender).toContain(`path: "${route}"`);
    expect(prerender).toContain(`file: "${file}"`);
    expect(prerender).toContain(`title: "${title}"`);
  });

  it.each(LEGAL_PAGES)("renders $heading from its markdown source of truth", ({ route, component, md, heading, title }) => {
    const page = read(`client/src/pages/${component}.tsx`);
    // The page is a single-source-of-truth wrapper around the markdown file.
    expect(page).toContain(`../../../legal`);
    expect(page).toMatch(/\.md\?raw/);
    expect(page).toContain(`title="${title}"`);
    expect(page).toContain(`path="${route}"`);
    expect(page).toContain("LegalDocPage");

    const source = read(md);
    expect(source.startsWith(`# ${heading}`)).toBe(true);
    // Legal pages must never fabricate registration data (RC/ICE/IF).
    expect(source).not.toMatch(/RC\s*[:：]?\s*\d/i);
    expect(source).not.toMatch(/ICE\s*[:：]?\s*\d/i);
  });

  it("shares one LegalDocPage that renders an h1 and sets SEO", () => {
    const component = read("client/src/pages/LegalDocPage.tsx");
    expect(component).toContain("useSEO(");
    expect(component).toContain("<h1");
    expect(component).toContain('useSEO({ title, description, path, language: "ar" })');
  });

  it.each(LEGAL_PAGES)("registers $route in the SPA router", ({ route }) => {
    const app = read("client/src/App.tsx");
    expect(app).toContain(`Route path="${route}"`);
  });

  it.each(LEGAL_PAGES)("links $route from the footer in every layout", ({ route }) => {
    const footer = read("client/src/components/Footer.tsx");
    expect(footer).toContain(`href="${route}"`);
  });

  it.each(LEGAL_PAGES)("includes $route in sitemap generation", ({ route }) => {
    const sitemapScript = read("scripts/sitemap.mjs");
    expect(sitemapScript).toContain(`{ path: "${route}"`);

    const sitemapXml = read("client/public/sitemap.xml");
    expect(sitemapXml).toContain(`https://altusplace.vercel.app${route}`);
  });

  it.each(LEGAL_PAGES)("resolves Arabic crawler metadata + canonical for $route", async ({ route, title }) => {
    const metadata = await resolveRouteMetadata(route, "https://altusplace.vercel.app");
    expect(metadata.title).toBe(title);
    expect(metadata.description.length).toBeGreaterThan(20);
    expect(metadata.canonical).toBe(`https://altusplace.vercel.app${route}`);
    expect(metadata.robots).toContain("index");
  });
});