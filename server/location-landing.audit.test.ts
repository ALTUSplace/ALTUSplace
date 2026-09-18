import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("location landing pages audit", () => {
  it("maps every Moroccan city to a canonical latin slug for /locations/<slug>", () => {
    const cities = read("client/src/data/moroccoCities.ts");
    expect(cities).toContain("MOROCCO_CITY_SLUGS");
    expect(cities).toContain("'الدار البيضاء': 'casablanca'");
    expect(cities).toContain("'مراكش': 'marrakech'");
    expect(cities).toContain("'أغادير': 'agadir'");
    expect(cities).toContain("'الرباط': 'rabat'");
    expect(cities).toContain("'العيون': 'laayoune'");
    expect(cities).toContain("'الداخلة': 'dakhla'");
  });

  it("provides slug resolution helpers used by the landing pages", () => {
    const cities = read("client/src/data/moroccoCities.ts");
    expect(cities).toContain("export function cityFromSlug");
    expect(cities).toContain("export function slugForCity");
    expect(cities).toContain("export function matchListingCity");
  });

  it("renders dynamic city landing pages from the /locations/:slug route", () => {
    const landing = read("client/src/pages/LocationLanding.tsx");
    expect(landing).toContain('useRoute("/locations/:slug")');
    expect(landing).toContain("cityFromSlug(slug)");
    expect(landing).toContain("slugForCity(city)");
    expect(landing).toContain("matchListingCity");
    expect(landing).toContain("trpc.listings.list.useQuery");
    expect(landing).toContain("ListingCard");
    expect(landing).toContain("MOROCCO_REGIONS");
  });

  it("applies SEO meta tags and JSON-LD structured data on the landing pages", () => {
    const landing = read("client/src/pages/LocationLanding.tsx");
    expect(landing).toContain("useSEO");
    expect(landing).toContain("renderJsonLd");
    expect(landing).toContain('"@type": "BreadcrumbList"');
    expect(landing).toContain('"@type": "ItemList"');
  });

  it("keeps the bespoke Marrakech and airport landing pages", () => {
    const landing = read("client/src/pages/LocationLanding.tsx");
    expect(landing).toContain("marrakech");
    expect(landing).toContain("casablancaAirport");
    expect(landing).toContain("marrakech-car-rental");
    expect(landing).toContain("mohammed-v-airport-car-rental");
    const app = read("client/src/App.tsx");
    expect(app).toContain('location="marrakech"');
    expect(app).toContain('location="casablancaAirport"');
  });

  it("routes the locations hub and city slugs in the app", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('<Route path="/locations">');
    expect(app).toContain('<Route path="/locations/:slug">');
  });

  it("lists every city landing page in the sitemap", () => {
    const sitemap = read("client/public/sitemap-cities.xml");
    expect(sitemap).toContain("locations/casablanca");
    expect(sitemap).toContain("locations/marrakech");
    expect(sitemap).toContain("locations/agadir");
    expect(sitemap).toContain("locations/tangier");
    expect(sitemap).toContain("locations/oujda");
    expect(sitemap).toContain("locations/laayoune");
    expect(sitemap).toContain("locations/dakhla");
    expect(sitemap).toContain("locations/marrakech-car-rental");
  });

  it("keeps the shared regional city dropdown used by listing forms", () => {
    const component = read("client/src/components/CitySelect.tsx");
    expect(component).toContain("MOROCCO_REGIONS.map");
    expect(component).toContain("<optgroup");
    expect(component).toContain('cityLabelFr(city)');
  });
});