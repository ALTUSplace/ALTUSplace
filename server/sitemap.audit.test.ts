import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSitemapIndex, buildUrlset } from "../shared/sitemap";
import { buildListingsSitemap } from "./_core/sitemap";
import { injectPrerenderMetadata } from "./_core/prerender";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("sitemap + robots audit", () => {
  it("publishes a single deterministic sitemap.xml with marketing routes", () => {
    const sitemap = read("client/public/sitemap.xml");
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toContain("https://altusplace.ma/");
    for (const slug of ["casablanca", "marrakech", "agadir", "rabat", "tangier", "fes"]) {
      expect(sitemap).toContain(`https://altusplace.ma/city/${slug}`);
    }
    expect(sitemap).toContain("https://altusplace.ma/terms");
    expect(sitemap).toContain("https://altusplace.ma/privacy");
    expect(sitemap).toContain("https://altusplace.ma/blog");
    // Top published listings (cap 500) are appended with their own entries.
    expect(sitemap).toMatch(/<loc>https:\/\/altusplace\.ma\/(?:car|property)\/\d+<\/loc>/);
    // The old sitemap-index + sub-sitemap scheme no longer exists.
    expect(sitemap).not.toContain("<sitemapindex");
    expect(sitemap).not.toContain("sitemap-static.xml");
    expect(sitemap).not.toContain("sitemap-cities.xml");
  });

  it("keeps only public marketing pages in the sitemap", () => {
    const sitemap = read("client/public/sitemap.xml");
    // Redirects and protected routes must never be submitted.
    for (const forbidden of ["/add-car", "/help", "/dashboard", "/admin", "/checkout", "/direct-login", "/locations/"]) {
      expect(sitemap).not.toContain(forbidden);
    }
  });

  it("points robots.txt at the sitemap and blocks private areas", () => {
    const robots = read("client/public/robots.txt");
    expect(robots).toContain("Sitemap: https://altusplace.vercel.app/sitemap.xml");
    expect(robots).toContain("Allow: /");
    for (const area of ["/admin", "/host", "/api", "/direct-login"]) {
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
