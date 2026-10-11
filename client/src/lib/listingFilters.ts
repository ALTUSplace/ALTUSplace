/**
 * Public-display filters that keep demo/test/seed rows and synthetic reviews
 * out of every marketplace surface. The server seed stays intact — its tests
 * assert the dataset exists — so this only gates what customers can see, it
 * never deletes server data.
 */

/** Provider ids minted by the demo seeds (users.openId markers). */
export const DEMO_PROVIDER_IDS: readonly string[] = [
  "demo-owner-altusplace",
  "demo-owner-id",
  "platform-owner",
];

/**
 * Display names of the demo/seed owners that do not carry a Latin "demo"
 * token: `server/demoSeed.ts` ("ALTUSplace Team") and
 * `server/seed/demo-listings.ts` ("ALTUSplace Demo Partner").
 */
export const DEMO_PROVIDER_NAMES: readonly string[] = [
  "altusplace team",
  "altusplace demo partner",
];

/** Human/machine markers that flag a row as demo, test, or the platform owner. */
const DEMO_MARKER = /\b(demo|test|platform\s*owner)\b/i;

/** Arabic "demo"/"experimental" marker used by the static showcase provider. */
const AR_DEMO_MARKER = /تجريبي/;

/** Seed ids look like `ALT-9942` (case-insensitive). */
const SEED_ID = /^alt-\d+/i;

/** Placeholder copy that must never reach customers. */
const LOREM_MARKER = /\b(lorem ipsum|dolor sit amet|consectetur)\b/i;

/** Minimal shape shared by raw DB rows and mapped ListingItem values. */
export interface DemoFilterable {
  id?: string | number | null;
  providerId?: string | number | null;
  providerName?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  ownerId?: string | number | null;
  ownerName?: string | null;
  ownerRole?: string | null;
}

/** Minimal shape shared by server and static review objects. */
export interface ReviewFilterable {
  userName?: string | null;
  comment?: string | null;
  providerName?: string | null;
}

const asText = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const asId = (value: unknown): string => asText(value).trim().toLowerCase();

const DEMO_ID_SET = new Set(DEMO_PROVIDER_IDS.map((id) => id.toLowerCase()));
const DEMO_NAME_SET = new Set(DEMO_PROVIDER_NAMES.map((name) => name.toLowerCase()));

/**
 * True when a listing belongs to the demo/test/platform-owner dataset, either
 * by provider id, owner name, demo marker (Latin or Arabic), or a seed-style
 * `ALT-####` id.
 */
export function isDemoListing(item: DemoFilterable): boolean {
  const providerId = asId(item.providerId) || asId(item.ownerId);
  if (providerId && DEMO_ID_SET.has(providerId)) return true;
  const id = asText(item.id).trim();
  if (SEED_ID.test(id)) return true;
  const providerName = (asText(item.providerName) || asText(item.ownerName)).trim();
  if (!providerName) return false;
  if (DEMO_NAME_SET.has(providerName.toLowerCase())) return true;
  return DEMO_MARKER.test(providerName) || AR_DEMO_MARKER.test(providerName);
}

/**
 * True when a listing has enough content to render a useful card: a real title
 * plus at least one of a description snippet or an image — with no placeholder
 * (lorem) or truncated single-character copy. A row is hidden only when it is a
 * truly empty shell (neither a description nor an image).
 */
export function hasDisplayableContent(item: DemoFilterable): boolean {
  const title = asText(item.title).trim();
  const description = asText(item.description).trim();
  const image = asText(item.image).trim() || item.images?.find((entry) => Boolean(entry))?.trim() || "";
  if (title.length < 3) return false;
  if (!description && !image) return false;
  if (LOREM_MARKER.test(title) || LOREM_MARKER.test(description)) return false;
  return true;
}

/** Drops demo/test rows and incomplete cards from a public listing list. */
export function filterMarketplaceListings<T extends DemoFilterable>(items: readonly T[]): T[] {
  return items.filter((item) => !isDemoListing(item) && hasDisplayableContent(item));
}

/**
 * True when a review is synthetic (demo/test author) or has no usable comment
 * — such entries must not inflate a listing's rating.
 */
export function isDemoReview(review: ReviewFilterable): boolean {
  const author = asText(review.userName).trim();
  const comment = asText(review.comment).trim();
  if (author && DEMO_MARKER.test(author)) return true;
  if (review.providerName && DEMO_MARKER.test(asText(review.providerName))) return true;
  if (LOREM_MARKER.test(comment)) return true;
  return comment.length < 3;
}

/** Drops synthetic/empty reviews before they are shown or averaged. */
export function filterMarketplaceReviews<T extends ReviewFilterable>(reviews: readonly T[]): T[] {
  return reviews.filter((review) => !isDemoReview(review));
}
