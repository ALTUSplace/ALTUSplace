/**
 * Shared sitemap fixture for the audit tests.
 *
 * `client/public/sitemap*.xml` are build artifacts: `pnpm build` regenerates
 * them (via `scripts/sitemap.mjs`) before `vite build`, and they are
 * deliberately not tracked in git. Tests must therefore never read them off
 * disk -- in CI they do not exist, and locally they reflect whatever the last
 * build managed to load from the database rather than the generator itself.
 *
 * These tests build the documents through the real shared builders instead,
 * with a fixed origin and city list, so they assert the generator's behaviour
 * deterministically. The counts mirror `scripts/sitemap.mjs`.
 *
 * Deliberately a `.mjs` file: tsconfig only includes TypeScript sources under
 * the server directory (no `allowJs`), and it excludes test files from
 * checking anyway. A plain `.mjs` helper sits outside both, so importing it
 * from a test adds no types to maintain.
 */
import {
  buildCitiesSitemap,
  buildSitemapIndexXml,
  buildStaticSitemap,
} from "../shared/sitemap.ts";

/** The production origin the generator defaults to; kept in sync with .env. */
export const TEST_SITE_URL = "https://altusplace.vercel.app";

/** Mirrors the fixed city list in scripts/sitemap.mjs. */
export const TEST_CITY_SLUGS = ["casablanca", "marrakech", "agadir", "rabat", "tangier", "fes"];

/** The sitemap index (`/sitemap.xml`). */
export function buildTestSitemapIndex() {
  return buildSitemapIndexXml(TEST_SITE_URL);
}

/** The marketing/static sub-sitemap (`/sitemap-static.xml`). */
export function buildTestStaticSitemap() {
  return buildStaticSitemap(TEST_SITE_URL);
}

/** The city sub-sitemap (`/sitemap-cities.xml`). */
export function buildTestCitiesSitemap() {
  return buildCitiesSitemap(TEST_SITE_URL, TEST_CITY_SLUGS);
}

/**
 * Every build-time document concatenated, for the assertions that scan "the
 * sitemap" as a whole. Runtime listings/companies sub-sitemaps are served from
 * the database and are intentionally not part of the build output.
 */
export function buildTestSitemap() {
  return [buildTestSitemapIndex(), buildTestStaticSitemap(), buildTestCitiesSitemap()].join("\n");
}
