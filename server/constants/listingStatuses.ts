/**
 * Single Source of Truth for publicly visible inventory filters.
 *
 * WHY THIS EXISTS
 *   Every customer-facing surface that exposes a listing (homepage, search,
 *   listing detail, booking guards, admin KPIs, sitemap, prerender) must agree
 *   on which `status` values count as "public". The same literal array used to
 *   be copy-pasted across `server/routers.ts` and had already drifted, so a
 *   future status change risked updating only one call site.
 */
import { listingStatusEnum } from "../../drizzle/schema";

/** Every value of the `listing_status` Postgres enum, from the Drizzle schema. */
export type ListingStatus = (typeof listingStatusEnum.enumValues)[number];

/**
 * Statuses that make a listing publicly visible across the marketplace.
 */
export const PUBLIC_LISTING_STATUSES: readonly ListingStatus[] = [
  "Published",
  "Available",
  "Approved",
];

/**
 * Narrower set used for SEO output (sitemap + prerendered JSON-LD).
 *
 * NOTE: this intentionally mirrors what `sitemap.ts`/`prerender.ts` hardcoded
 * before this file existed, which excluded "Approved". Whether that exclusion
 * is correct is an open product question — it is preserved here so the
 * extraction stays behaviour-neutral.
 */
export const SEO_LISTING_STATUSES: readonly ListingStatus[] = [
  "Published",
  "Available",
];
