import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("nationwide multi-region scope audit", () => {
  it("provides a shared nationwide city list used everywhere", () => {
    const cities = read("client/src/data/moroccoCities.ts");
    expect(cities).toContain("الدار البيضاء");
    expect(cities).toContain("مراكش");
    expect(cities).toContain("الرباط");
    expect(cities).toContain("طنجة");
    expect(cities).toContain("فاس");
    expect(cities).toContain("أغادير");
    expect(cities).toContain("مكناس");
    expect(cities).toContain("وجدة");
    expect(cities).toContain("العيون");
    expect(cities).toContain("الداخلة");
    expect(cities).toContain("resolveCitySlug");
  });

  it("points the search city filter at the shared nationwide dropdown", () => {
    const search = read("client/src/pages/Search.tsx");
    expect(search).toContain("CitySelect");
    expect(search).toContain("resolveCitySlug");
  });

  it("uses the shared regional dropdown in agency forms, search and home", () => {
    const agency = read("client/src/pages/AgencyDashboard.tsx");
    expect(agency).toContain('import { CitySelect } from "@/components/CitySelect"');
    expect(agency).toContain("CitySelect value={carForm.city}");
    expect(agency).toContain("CitySelect value={propertyForm.city}");
    const home = read("client/src/pages/Home.tsx");
    expect(home).toContain("CitySelect");
    const addCar = read("client/src/pages/AddCar.tsx");
    expect(addCar).toContain("CitySelect");
    const bottomSheet = read("client/src/components/FilterBottomSheet.tsx");
    expect(bottomSheet).toContain("...MOROCCAN_CITIES");
  });

  it("defines the shared dropdown over the 12 administrative regions", () => {
    const cities = read("client/src/data/moroccoCities.ts");
    expect(cities).toContain("MOROCCO_REGIONS");
    expect(cities).toContain("nameFr");
    expect(cities).toContain("MOROCCO_REGIONS.flatMap((region) => region.cities)");
    const component = read("client/src/components/CitySelect.tsx");
    expect(component).toContain("MOROCCO_REGIONS.map((region) =>");
    expect(component).toContain("<optgroup");
  });

  it("accepts any Moroccan city on the server (no restricted allow-list)", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("city: z.string().trim().min(2).max(64).optional()");
    expect(routers).toContain("city: z.string().trim().min(1).max(64).optional()");
    expect(routers).toContain("city: z.string()");
    expect(routers).not.toContain("z.enum(['الدار البيضاء'");
    expect(routers).not.toContain("Z_COMMON_MOROCCAN_CITIES_ENUM");
  });

  it("lets any vendor register an agency without a city restriction", () => {
    const routers = read("server/routers.ts");
    const start = routers.indexOf("becomeAgency: protectedProcedure");
    const end = routers.indexOf("logout: publicProcedure", start);
    const becomeAgency = routers.slice(start, end > -1 ? end : start + 2_000);
    expect(becomeAgency).toContain("agencyName: z.string().trim().min(2).max(80)");
    expect(becomeAgency).toContain("role: 'owner' as const");
    expect(becomeAgency).not.toContain("city: z.string");
  });

  it("keeps per-city tax rates city-agnostic with a nationwide fallback", () => {
    const billing = read("server/billing.ts");
    expect(billing).toContain("CITY_TAX_RATES");
    expect(billing).toContain("MOROCCO_VAT_RATE_BASIS_POINTS");
    expect(billing).toContain("getTaxRateForCity");
    expect(billing).toContain("CITY_TAX_RATES[city] ?? MOROCCO_VAT_RATE_BASIS_POINTS");
  });
});