import { describe, expect, it } from "vitest";

const ga4Id = process.env.VITE_GA4_MEASUREMENT_ID;
const metaPixelId = process.env.VITE_META_PIXEL_ID;

describe("analytics configuration", () => {
  // These identifiers are deployment secrets; the probe only runs when the
  // CI environment actually configures them.
  it.skipIf(!ga4Id || !metaPixelId)(
    "accepts the configured GA4 measurement endpoint and identifiers",
    async () => {
      expect(ga4Id).toMatch(/^G-[A-Z0-9]+$/);
      expect(metaPixelId).toMatch(/^\d+$/);

      const response = await fetch(`https://www.google-analytics.com/g/collect?measurement_id=${encodeURIComponent(ga4Id!)}&api_version=2&validationBehavior=ENFORCE_RECOMMENDATIONS&client_id=0.0&events=`);
      expect([200, 204]).toContain(response.status);
    },
    15_000,
  );
});
