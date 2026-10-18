import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSitemapIndex, buildUrlset } from "../shared/sitemap";
import { buildListingsSitemap, SEO_SITE_URL } from "./_core/sitemap";
import { injectPrerenderMetadata } from "./_core/prerender";
import {
  buildTestCitiesSitemap,
  buildTestSitemap,
  buildTestSitemapIndex,
  buildTestStaticSitemap,
  TEST_SITE_URL,
} from "./sitemap-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("sitemap + robots audit", () => {
  it("publishes a sitemap index wired to the static and runtime sub-sitemaps", () => {
    // Built through the shared builders rather than read from
    // client/public/sitemap.xml: that path is a gitignored build artifact, so
    // it is absent in CI and locally reflects the last build rather than the
    // generator's own behaviour.
    const index = buildTestSitemapIndex();
    expect(index).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const sub of [
      "sitemap-static.xml",
      "sitemap-cities.xml",
      "api/sitemap-listings.xml",
      "api/sitemap-companies.xml",
    ]) {
      expect(index).toContain(`<loc>${TEST_SITE_URL}/${sub}</loc>`);
    }
  });

  it("lists the marketing routes in the static sub-sitemap", () => {
    const staticXml = buildTestStaticSitemap();
    expect(staticXml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(staticXml).toContain(`${TEST_SITE_URL}/`);
    expect(staticXml).toContain(`${TEST_SITE_URL}/privacy`);
    expect(staticXml).toContain(`${TEST_SITE_URL}/blog`);
    // Listings are dynamic (served at /api/sitemap-listings.xml), never baked in.
    expect(staticXml).not.toMatch(/<loc>https:\/\/[^<]*\/(?:car|property)\/\d+<\/loc>/);
  });

  it("lists the six prerendered city pages in the cities sub-sitemap", () => {
    const cities = buildTestCitiesSitemap();
    for (const slug of ["casablanca", "marrakech", "agadir", "rabat", "tangier", "fes"]) {
      expect(cities).toContain(`${TEST_SITE_URL}/city/${slug}`);
    }
  });

  it("includes the searchable listings page", () => {
    // /search is a crawlable marketing route with its own indexable metadata,
    // so it belongs in the static sitemap alongside /blog.
    expect(buildTestStaticSitemap()).toContain(`${TEST_SITE_URL}/search`);
  });

  it("keeps only public marketing pages in the sitemap", () => {
    const sitemap = buildTestSitemap();
    // Redirects and protected routes must never be submitted.
    for (const forbidden of ["/add-car", "/help", "/dashboard", "/admin", "/checkout", "/owner-login", "/register", "/terms", "/locations/"]) {
      expect(sitemap).not.toContain(forbidden);
    }
  });

  it("points robots.txt at the sitemap and blocks private areas", () => {
    const robots = read("client/public/robots.txt");
    expect(robots).toContain("Sitemap: https://altusplace.ma/sitemap.xml");
    expect(robots).toContain("Allow: /");
    for (const area of ["/admin", "/host", "/api", "/owner-login", "/register", "/terms"]) {
      expect(robots).toContain(`Disallow: ${area}`);
    }
  });

  it("escapes XML entities in generated URLs", () => {
    const xml = buildUrlset([{ loc: "https://altusplace.vercel.app/search?a=1&b=2" }]);
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).not.toContain("a=1&b=2");
  });

  it("builds the listings sub-sitemap with car/property routes and lastmod", async () => {
    const xml = await buildListingsSitemap(async () => [
      { id: 5, category: "car", createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: 9, category: "real_estate", createdAt: null },
    ]);
    expect(xml).toContain(`${SEO_SITE_URL}/car/5`);
    expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
    expect(xml).toContain(`${SEO_SITE_URL}/property/9`);
  });

  it("produces a valid empty urlset without a database", async () => {
    const xml = await buildListingsSitemap(async () => []);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).not.toContain("<url>");
  });

  it("replaces the document head metadata when prerendering", async () => {
    const template = `<!doctype html><html><head><title>Old</title><meta name="description" content="old"><link rel="canonical" href="https://altusplace.ma/"><link rel="alternate" hreflang="en" href="https://altusplace.ma/en"></head><body><div id="root"></div></body></html>`;
    const html = await injectPrerenderMetadata(template, "/locations/casablanca", "https://altusplace.vercel.app");
    expect(html).not.toContain("<title>Old</title>");
    expect(html).not.toContain('hreflang="en"');
    expect(html).toContain('<link rel="canonical" href="https://altusplace.vercel.app/locations/casablanca">');
    expect(html).toContain("كراء");
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
  });

  it("round-trips a sitemap index through the shared builder", () => {
    const xml = buildSitemapIndex(["https://altusplace.vercel.app/sitemap-static.xml"]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://altusplace.vercel.app/sitemap-static.xml</loc>");
  });
});
