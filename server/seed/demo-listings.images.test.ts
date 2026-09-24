import { describe, expect, it } from "vitest";
import { DEMO_LISTING_ROWS } from "./demo-listings";

/**
 * Model token = the "Brand Model" phrase in each demo car title (e.g. "Dacia
 * Duster 2023 — Location…" → `dacia_duster`), normalized to the underscore
 * form used in Wikimedia Commons filenames so it can be matched against the
 * image URL. A listing image must show the exact make/model, never a generic
 * or look-alike car.
 */
function modelToken(title: string): string {
  const match = title.match(/^([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)+?)\s+\d{4}\b/);
  if (!match) throw new Error(`cannot derive model token from car title: "${title}"`);
  return match[1].toLowerCase().replace(/\s+/g, "_");
}

describe("demo listings image accuracy", () => {
  const cars = DEMO_LISTING_ROWS.filter((row) => row.category === "car");

  /** GET an image URL → HTTP status, or null when offline (network error). */
  async function fetchStatus(url: string): Promise<number | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "ALTUSplace-demo-seed-test/1.0 (contact: demo@altusplace.ma)" },
        });
        if (res.status === 429) {
          // upload.wikimedia.org rate-limits bursts — back off and retry once.
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        return res.status;
      } catch {
        return null; // no network — caller skips gracefully
      }
    }
    return 429; // still rate-limited after retries
  }

  it("every demo car image URL is https and contains its model token (listing title ↔ image)", () => {
    expect(cars.length).toBe(6);

    for (const car of cars) {
      const urls = [car.imageUrl!, ...(car.images ?? [])];
      expect(urls.length).toBeGreaterThanOrEqual(3);
      const token = modelToken(car.title);

      for (const url of urls) {
        expect(url).toMatch(/^https:\/\//);
        // decodeURIComponent turns %28/%2C/%E2%80%93 etc. back into readable
        // filename characters before the substring match.
        expect(decodeURIComponent(url).toLowerCase()).toContain(token);
      }
    }
  });

  it("every demo car image URL responds HTTP 200 (skips gracefully when offline)", async () => {
    for (const car of cars) {
      const urls = [car.imageUrl!, ...(car.images ?? [])];
      for (const url of urls) {
        const status = await fetchStatus(url);
        if (status === null) continue; // offline CI / sandbox — skip
        expect(status).toBe(200);
        // Sequential requests with a small pause avoid tripping the per-IP
        // rate limiter on upload.wikimedia.org.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }, 120_000);
});