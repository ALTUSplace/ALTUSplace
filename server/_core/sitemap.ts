/**
 * Runtime sitemap routes.
 *
 * The static sitemap index (`/sitemap.xml`), `/sitemap-static.xml` and
 * `/sitemap-cities.xml` are generated at build time by
 * `scripts/generate-sitemap.ts`. Listings change with inventory, so their
 * sub-sitemap (and the Phase 2 companies sub-sitemap) are served from the
 * database here and referenced by the index.
 */
import type { Express, Response } from "express";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { listings } from "../../drizzle/schema";
import { isCarCategory } from "../../client/src/lib/categories";
import { buildUrlset, normalizeSiteUrl } from "../../shared/sitemap";

export const SEO_SITE_URL = normalizeSiteUrl(process.env.VITE_SITE_URL || "https://altusplace.ma");

const MAX_LISTING_URLS = 5000;
const PUBLISHED_STATUSES = ["Published", "Available"] as const;

export type SitemapListingRow = {
  id: number;
  category: string | null;
  createdAt?: Date | string | null;
};

function lastmodOf(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

/** Builds the listings sub-sitemap. Accepts an optional fetcher for tests. */
export async function buildListingsSitemap(fetcher?: () => Promise<SitemapListingRow[]>): Promise<string> {
  let rows: SitemapListingRow[] = [];
  try {
    if (fetcher) {
      rows = await fetcher();
    } else {
      const db = await getDb();
      if (db) {
        rows = await db
          .select({ id: listings.id, category: listings.category, createdAt: listings.createdAt })
          .from(listings)
          .where(inArray(listings.status, [...PUBLISHED_STATUSES]))
          .orderBy(desc(listings.id))
          .limit(MAX_LISTING_URLS);
      }
    }
  } catch {
    rows = [];
  }

  return buildUrlset(
    rows.map((row) => ({
      loc: `${SEO_SITE_URL}${isCarCategory(row.category ?? "") ? "/car/" : "/property/"}${row.id}`,
      lastmod: lastmodOf(row.createdAt),
      changefreq: "weekly",
      priority: "0.6",
    })),
  );
}

/** Public agency profile pages ship in Phase 2 — keep the sub-sitemap valid. */
export function buildCompaniesSitemap(): string {
  return buildUrlset([]);
}

function sendXml(res: Response, body: string): void {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.status(200).send(body);
}

export function registerSitemapRoutes(app: Express): void {
  app.get("/api/sitemap-listings.xml", async (_req, res) => {
    try {
      sendXml(res, await buildListingsSitemap());
    } catch {
      sendXml(res, buildUrlset([]));
    }
  });
  app.get("/api/sitemap-companies.xml", (_req, res) => {
    sendXml(res, buildCompaniesSitemap());
  });
}
