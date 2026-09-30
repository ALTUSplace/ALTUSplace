/**
 * Shared sitemap fixture for the audit tests.
 *
 * `client/public/sitemap.xml` is a build artifact: `pnpm build` regenerates it
 * (via `scripts/sitemap.mjs`) before `vite build`, and it is deliberately not
 * tracked in git. Tests must therefore never read it off disk -- in CI it does
 * not exist, and locally it reflects whatever the last build managed to load
 * from the database rather than the generator itself.
 *
 * These tests build the document through the real generator instead, with a
 * fixed listing set, so they assert the generator's behaviour deterministically.
 *
 * Deliberately a `.mjs` file: tsconfig only includes TypeScript sources under
 * the server directory (no `allowJs`), and it excludes test files from
 * checking anyway. A plain `.mjs` helper sits outside both, so importing it
 * from a test adds no types to maintain.
 */
import { buildSitemapXml } from "../scripts/sitemap.mjs";

/** The production origin the generator defaults to; kept in sync with .env. */
export const TEST_SITE_URL = "https://altusplace.vercel.app";

/**
 * Two listings, one per branch of the category classifier, so the tests cover
 * both the `/car/` and `/property/` URL shapes without a database. `created_at`
 * and `createdAt` are both present on purpose: the SQL loader aliases the column
 * to `created_at`, while the Drizzle column is `createdAt`.
 */
export const FIXTURE_LISTINGS = [
  { id: 9001, category: "car", created_at: "2026-01-15T00:00:00.000Z" },
  { id: 9002, category: "real_estate", createdAt: "2026-01-16T00:00:00.000Z" },
];

/** Full sitemap document for {@link FIXTURE_LISTINGS}. */
export function buildTestSitemap(listings = FIXTURE_LISTINGS) {
  return buildSitemapXml(TEST_SITE_URL, listings);
}
