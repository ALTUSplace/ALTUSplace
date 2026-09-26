/**
 * Listing category classification — the single source of truth for telling a
 * vehicle apart from a real-estate stay.
 *
 * Shared deliberately by both sides of the wire, because they must agree:
 * the client decides which card renders and which route a marker links to
 * (`/car/<id>` vs `/property/<id>`), while `normalizeBookingCategory` on the
 * server decides which identity document the guest is asked for before
 * checkout. When the two disagreed, a commercial shop (`محل تجاري`) rendered a
 * car card and linked to `/car/<id>` on the client while the server correctly
 * demanded an identity document for a property stay.
 *
 * A stored `category` is free text, not an enum. The platform writes canonical
 * values (`car`, `real_estate`), but partner-facing forms also write localised
 * labels — `AddCar.tsx` offers `SUV / سيارة رباعية` and `سيدان عائلية / Sedan`,
 * `FilterBottomSheet.tsx` filters on `شقق مفروشة` and `فلل`. Classification
 * therefore matches vocabulary rather than an exact set of values.
 *
 * The default is a property stay, and that direction is the whole point:
 *
 *   - A deny-list ("a car unless it looks like property") silently routes every
 *     property word the list has not seen yet to `/car/<id>`. `دار` and
 *     `محل تجاري` both reached the car route that way. The failure is invisible:
 *     no error, just a shop that opens a car detail page.
 *   - The server's default decides which identity document is demanded, so an
 *     unrecognised value must fall towards the requirement that *asks for proof*
 *     (national ID or passport) rather than towards the one that does not.
 *
 * The resulting risk is asymmetric, and deliberately so. A missed *vehicle* word
 * shows a property card: visible, and someone reports it. A missed *property*
 * word is not possible, because property is the fallback rather than a pattern
 * to be maintained. `isRecognisedListingCategory` exists so the unknowns can be
 * found deliberately instead of by accident.
 */

/** Which product family a listing belongs to. Mirrors the server's `BookingCategory`. */
export type ListingKind = "car" | "property";

/**
 * Arabic `ة` is written with two different code points in real listing data:
 * U+0629 (teh) and U+062A (teh marbuta). Both appear, they look identical, and
 * a regex literal pinned to one of them silently fails on the other — so every
 * `ة` below is written as `[\u0629\u062A]` rather than as a bare character.
 * The same applies to the alef in `أرض` / `إقامة`, which is spelled out as
 * separate alternatives rather than folded into a class.
 */
const T = "[\\u0629\\u062A]";

/**
 * Vehicles, matched positively. Latin terms are word-bounded so `car` does not
 * match inside `caravane` or `local commercial`.
 */
const VEHICLE_HINTS = new RegExp(
  [
    String.raw`\b(?:cars?|automobiles?|motorcars?|vehicles?)\b`,
    String.raw`\b(?:suv|4x4|sedans?|hatchbacks?|coup(?:e|é)s?|convertibles?|cabriolets?` +
      String.raw`|pick[\s-]?ups?|minivans?|vans?|trucks?|lorries?|bus(?:es)?|minibuses|taxis?` +
      String.raw`|motorcycles?|motos?|scooters?|bikes?|bicycles?|camions?|utilitaires?|berlines?)\b`,
    // French vehicle vocabulary, which was the one locale with a real hole.
    //
    // `voiture` and `véhicule` are the two commonest French words for a car and
    // both were absent, while the rarer `berline`, `utilitaire` and `camion`
    // were present — so French vehicle listings fell through to the property
    // default. That is the expensive direction of the failure: the listing
    // rendered a property card, linked to `/property/<id>` instead of
    // `/car/<id>`, and `normalizeBookingCategory` asked for a national ID or
    // passport where a driving licence is required, blocking the booking. It is
    // not hypothetical either — the demo seed already writes "Location voiture
    // à Casablanca" and reviews already say "véhicule propre".
    //
    // Accents are spelled out as alternatives rather than folded into a class,
    // because listing text is pasted both with and without them, and the same
    // applies to the plural ending.
    //
    // `break` is deliberately NOT added, although "Renault Break" is a real
    // body style: it is an ordinary English noun in every other context, and a
    // false positive here is the one failure mode that cannot be seen — it
    // routes a stay to `/car/<id>` and demands a licence of a tenant.
    String.raw`\b(?:voitures?|v[ée]hicules?|v[ée]los?|autocars?|fourgons?|citadines?` +
      String.raw`|tracteurs?|tractors?|motocyclettes?|trois[\s-]?roues?|monospaces?)\b`,
    // سيارة / سيارات, plus the colloquial سياجه written with a bare ha.
    // The singular ends in ة (two code points, see `T`) while the plural appends
    // ا + ت, so they are separate alternatives rather than one optional letter.
    `سيار(?:${T}|ات)`,
    "سياره",
    `مركب(?:${T}|ات)`,
    `شاحن(?:${T}|ات)`,
    `حافل(?:${T}|ات)`,
    `دراج(?:${T}|ات)`,
    "تاكسي",
    "طاكسي",
    "موتو",
    "جيب",
    "سيدان",
    "هاتش",
    String.raw`بيك[\s-]?أب`,
    String.raw`دفع\s+رباعي`,
    "فان",
  ].join("|"),
  "iu",
);

/**
 * Stays. Not consulted to reach a decision — property is the default — but kept
 * as an explicit vocabulary so `isRecognisedListingCategory` can separate "we
 * know this is a stay" from "we have never seen this value", and so the two
 * lists can be reviewed side by side when the catalogue grows.
 *
 * `دار` (house) and `محل` (shop) are the two words whose absence caused the
 * original misrouting, and they are matched on purpose.
 */
const PROPERTY_HINTS = new RegExp(
  [
    String.raw`real[\s_-]?estate|propert(?:y|ies)|appartements?|apartments?|flats?|villas?|riads?` +
      String.raw`|offices?|coworking|hotels?|studios?|duplex(?:es)?|triplex(?:es)?|penthouse(?:s)?` +
      String.raw`|residences?|maisons?|chalets?|boutiques?|magasins?|locaux?|bureaux?|sièges?` +
      String.raw`|salle\s+de\s+r(?:é|e)union|immobilier|commerces?|entrepôts?|dépôts?|depots?` +
      String.raw`|hangars?|terrains?|lots?|fermes?|chambres?|salles?|immeubles?`,
    `شق${T}`, // شقة
    "شقق", // شقق
    "فيلا",
    "فلل", // فلل
    "مكتب",
    "مكاتب",
    "فندق",
    "فنادق",
    "دار",
    "محل",
    "محلات",
    "أرض",
    "ارض",
    "استوديو",
    "رياض",
    "دوبلكس",
    "عقار",
    "عقارات",
    "منزل",
    "بيوت",
    "مسكن",
    "سكن",
    `عم${"ا"}ر${T}`, // عمارة
    `إق${"ا"}م${T}`, // إقامة
    `اق${"ا"}م${T}`, // اقامة
    `مزرع(?:${T}|ات)`, // مزرعة / مزارع
    "بستان",
    "مستودع",
    "مخزن",
  ].join("|"),
  "iu",
);

/**
 * Classifies a stored listing `category` into a product family.
 *
 * Vehicles are matched first, so a value that somehow matches both lists (a
 * category naming a car *and* a house) resolves to `car` — the narrower and
 * more specific claim. Everything else, including `null`, `undefined` and the
 * empty string, is a property stay.
 */
export function classifyListingKind(category: string | null | undefined): ListingKind {
  const raw = (category ?? "").trim();
  if (raw.length === 0) return "property";
  return VEHICLE_HINTS.test(raw) ? "car" : "property";
}

/** True when the listing is a vehicle and should route to `/car/<id>`. */
export function isCarCategory(category: string | null | undefined): boolean {
  return classifyListingKind(category) === "car";
}

/** True when the listing is a stay and should route to `/property/<id>`. */
export function isPropertyCategory(category: string | null | undefined): boolean {
  return classifyListingKind(category) === "property";
}

/**
 * Whether `category` matches either vocabulary. `false` means the value fell
 * through to the property default without being recognised — a signal to add
 * the word, not a bug in itself.
 */
export function isRecognisedListingCategory(category: string | null | undefined): boolean {
  const raw = (category ?? "").trim();
  if (raw.length === 0) return false;
  return VEHICLE_HINTS.test(raw) || PROPERTY_HINTS.test(raw);
}
