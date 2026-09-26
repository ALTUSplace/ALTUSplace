/**
 * Listing category helpers — the client-side entry point, used by listing
 * cards, browse/search pages, favourites, the agency dashboard and checkout to
 * tell vehicles apart from real-estate stays.
 *
 * The classification itself moved to `@shared/listingCategory` so that this
 * module and `normalizeBookingCategory` on the server cannot drift apart again.
 * They previously carried separate regexes with *opposite* defaults: the client
 * asked "is this a car unless it looks like property?" while the server asked
 * "is this a car only if it looks like one?". A commercial shop (`محل تجاري`)
 * therefore rendered a car card and linked to `/car/<id>` here, while the server
 * correctly treated it as a stay. See the shared module for the vocabulary and
 * the reasoning behind the default.
 */
export {
  classifyListingKind,
  isCarCategory,
  isPropertyCategory,
  isRecognisedListingCategory,
  type ListingKind,
} from "@shared/listingCategory";
