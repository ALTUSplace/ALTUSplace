import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const project = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(project, file), "utf8");

describe("professional marketplace audit", () => {
  it("uses server listings for Search and focuses exclusively on car rentals", () => {
    const search = read("client/src/pages/Search.tsx");
    expect(search).toMatch(/trpc\.listings\.list\.useQuery/);
    expect(search).not.toMatch(/officeTypeFilter/);
    expect(search).not.toMatch(/rentalTermFilter/);
    expect(search).not.toMatch(/amenityFilters/);
    expect(search).not.toMatch(/LISTINGS\.filter/);
    expect(search).toMatch(/type: 'car'/);
  });

  it("keeps recommendations and property detail database-backed", () => {
    const recommendations = read("client/src/components/SmartRecommendations.tsx");
    const detail = read("client/src/pages/PropertyDetailWithVideo.tsx");
    expect(recommendations).toMatch(/trpc\.listings\.list\.useQuery/);
    expect(detail).toMatch(/trpc\.listings\.getById\.useQuery/);
    expect(detail).toMatch(/listing\?\./);
    expect(detail).not.toMatch(/MOCK|mock|fake|dummy/i);
  });
});
