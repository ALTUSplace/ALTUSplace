import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSitemapIndex, buildUrlset } from "../shared/sitemap";
import { buildListingsSitemap } from "./_core/sitemap";
import { injectPrerenderMetadata } from "./_core/prerender";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("sitemap + robots audit", () => {
  it("publishes a sitemap index that references every sub-sitemap", () => {
    const index = read("client/public/sitemap.xml");
    expect(index).toContain("<sitemapindex");
    expect(index).toContain("https://altusplace.ma/sitemap-static.xml");
    expect(index).toContain("https://altusplace.ma/sitemap-cities.xml");
    expect(index).toContain("https://altusplace.ma/api/sitemap-listings.xml");
    expect(index).toContain("https://altusplace.ma/api/sitemap-companies.xml");
  });

  it("keeps only public, canonical pages in the static sub-sitemap", () => {
    const sitemap = read("client/public/sitemap-static.xml");
    expect(sitemap).toContain("https://altusplace.ma/search");
    expect(sitemap).toContain("https://altusplace.ma/locations");
    expect(sitemap).toContain("https://altusplace.ma/blog");
    // Redirects and protected routes must never be submitted.
    expect(sitemap).not.toContain("/add-car");
    expect(sitemap).not.toContain("/help");
  });

  it("lists every city landing page in the cities sub-sitemap", () => {
    const sitemap = read("client/public/sitemap-cities.xml");
    for (const slug of ["casablanca", "marrakech", "agadir", "tangier", "oujda", "laayoune", "dakhla"]) {
      expect(sitemap).toContain(`locations/${slug}`);
    }
    expect(sitemap).toContain("locations/marrakech-car-rental");
    expect(sitemap).toContain("locations/mohammed-v-airport-car-rental");
  });

  it("points robots.txt at the canonical domain and keeps private areas out", () => {
    const robots = read("client/public/robots.txt");
    expect(robots).toContain("Sitemap: https://altusplace.ma/sitemap.xml");
    expect(robots).not.toContain("vercel.app");
    for (const area of ["/admin", "/kyc", "/checkout", "/api/"]) {
      expect(robots).toContain(`Disallow: ${area}`);
    }
  });

  it("escapes XML entities in generated URLs", () => {
    const xml = buildUrlset([{ loc: "https://altusplace.ma/search?a=1&b=2" }]);
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).not.toContain("a=1&b=2");
  });

  it("builds the listings sub-sitemap with car/property routes and lastmod", async () => {
    const xml = await buildListingsSitemap(async () => [
      { id: 5, category: "car", createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: 9, category: "real_estate", createdAt: null },
    ]);
    expect(xml).toContain("https://altusplace.ma/car/5");
    expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
    expect(xml).toContain("https://altusplace.ma/property/9");
  });

  it("produces a valid empty urlset without a database", async () => {
    const xml = await buildListingsSitemap(async () => []);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).not.toContain("<url>");
  });

  it("replaces the document head metadata when prerendering", async () => {
    const template = `<!doctype html><html><head><title>Old</title><meta name="description" content="old"><link rel="canonical" href="https://altusplace.vercel.app/"><link rel="alternate" hreflang="en" href="https://altusplace.vercel.app/en"></head><body><div id="root"></div></body></html>`;
    const html = await injectPrerenderMetadata(template, "/locations/casablanca", "https://altusplace.ma");
    expect(html).not.toContain("<title>Old</title>");
    expect(html).not.toContain("vercel.app");
    expect(html).toContain('<link rel="canonical" href="https://altusplace.ma/locations/casablanca">');
    expect(html).toContain("كراء");
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
  });

  it("round-trips a sitemap index through the shared builder", () => {
    const xml = buildSitemapIndex(["https://altusplace.ma/sitemap-static.xml"]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://altusplace.ma/sitemap-static.xml</loc>");
  });
});
