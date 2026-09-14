/**
 * Listing category helpers — the single client-side source of truth used by
 * listing cards, browse/search pages, the agency dashboard and the checkout
 * flow to tell vehicles apart from real-estate stays (apartments, villas,
 * offices, hotels, ...). Mirrors `normalizeBookingCategory` on the server.
 */

const PROPERTY_HINTS =
  /real_estate|property|office|coworking|hotel|شقة|فيلا|مكتب|فندق|villa|apartment|bureau|siège|salle\s*de\s*réunion/i;

/** A category is a vehicle when it is explicitly a car or not property-like at all. */
export function isCarCategory(category: string): boolean {
  return category === 'car' || !PROPERTY_HINTS.test(category);
}

/** Everything that is not a vehicle is treated as a real-estate stay. */
export function isPropertyCategory(category: string): boolean {
  return !isCarCategory(category);
}