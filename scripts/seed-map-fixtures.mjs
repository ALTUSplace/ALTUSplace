/**
 * Deterministic map fixtures for the cluster/popup/navigation interaction suite.
 *
 * These are NOT a database seed. They are injected by Playwright in place of the
 * `listings.search` tRPC response, which is what lets the real MapboxSearchMap
 * component be exercised against controlled data with no Postgres and no new
 * dependencies. See scripts/verify-map-interactions.mjs.
 *
 * Density is deliberately lopsided so the suite covers the three cases that
 * matter for clustering:
 *   - Casablanca: 22 points inside a ~1.5km blob  -> must collapse to one cluster
 *   - Rabat:       14 points inside a ~1.2km blob  -> must collapse to one cluster
 *   - Marrakech / Agadir / Tangier: 6-7 spread points each -> mostly individual,
 *     but they still cluster when the map is zoomed out to the country level
 * Mixes cars and properties so type-aware marker routing is exercised.
 */
import { isCarCategory } from "../shared/listingCategory.ts";

// City anchors matching client/src/lib/mapbox.ts cityToCoords.
const CITIES = [
  { name: "الدار البيضاء", slug: "casablanca", lat: 33.5731, lng: -7.5898, count: 22 },
  { name: "الرباط", slug: "rabat", lat: 34.0209, lng: -6.8416, count: 14 },
  { name: "مراكش", slug: "marrakech", lat: 31.6295, lng: -7.9811, count: 7 },
  { name: "أكادير", slug: "agadir", lat: 30.4278, lng: -9.5981, count: 7 },
  { name: "طنجة", slug: "tangier", lat: 35.7595, lng: -5.834, count: 6 },
];

const CAR_MODELS = [
  "دacia Duster",
  "-renault Clio",
  "بيجو 208",
  "Citroën C3",
  "Hyundai Tucson",
  "Toyota Hilux",
  "Dacia Logan",
  "Peugeot 301",
];
const PROP_TITLES = [
  "شقة فاخرة وسط المدينة",
  "ريزيدنس بإطلالة على البحر",
  "فيلا مع حديقة",
  "شقة اقتصادية للكراء",
];
/*
 * Categories are checked against the app's real classifier before the suite
 * runs (see findMisclassifiedFixtures), so a fixture can never be routed for the
 * wrong reason.
 *
 * `محل تجاري` (shop) and `دار` (house) used to be excluded from this list,
 * because `isCarCategory` was a deny-list and treated any category missing from
 * its property hints as a car — so both would have opened `/car/<id>` and made
 * the type-aware-routing assertions pass for the wrong reason. The classifier
 * now lives in `shared/listingCategory.ts` and recognises both, so they are
 * included on purpose: they are the two strings from the original bug report and
 * this suite is now the end-to-end guard that a property marker routes to
 * `/property/<id>`.
 */
export const CAR_CATEGORIES = ["سيارة", "car", "سيارة مدينة", "سيدان عائلية / Sedan"];
export const PROP_CATEGORIES = ["شقة", "property", "مكتب", "محل تجاري", "دار", "استوديو"];

/** Mulberry32 — small deterministic PRNG so fixtures are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMapFixtures() {
  const rand = rng(20260926);
  const items = [];
  let id = 1000;

  for (const city of CITIES) {
    for (let i = 0; i < city.count; i += 1) {
      const isCar = i % 3 !== 2; // ~2/3 cars, 1/3 properties
      // Tight spread (~0.012deg ~ 1.3km) so same-city points merge.
      const lat = +(city.lat + (rand() - 0.5) * 0.024).toFixed(6);
      const lng = +(city.lng + (rand() - 0.5) * 0.024).toFixed(6);
      const title = isCar
        ? `${CAR_MODELS[Math.floor(rand() * CAR_MODELS.length)]} ${2022 + Math.floor(rand() * 5)}`
        : `${PROP_TITLES[Math.floor(rand() * PROP_TITLES.length)]} ${city.name}`;

      items.push({
        id: id++,
        ownerId: 42,
        ownerRole: i % 4 === 0 ? "partner" : "user",
        ownerName: i % 4 === 0 ? "ALTUS Partner" : "مالك الإعلان #42",
        title,
        titleFr: null,
        description: `وصف تجريبي للعنصر رقم ${id} في ${city.name}`,
        // Category is what decides car vs property client-side (isCarCategory).
        category: isCar
          ? CAR_CATEGORIES[Math.floor(rand() * CAR_CATEGORIES.length)]
          : PROP_CATEGORIES[Math.floor(rand() * PROP_CATEGORIES.length)],
        pricePerDay: 150 + Math.floor(rand() * 850),
        dynamicPricePerDay: null,
        imageUrl: null,
        images: [],
        averageRating: +(3.5 + rand() * 1.5).toFixed(2),
        reviewCount: Math.floor(rand() * 40),
        city: city.name,
        lat,
        lng,
        fuelType: isCar ? ["petrol", "diesel", "hybrid"][Math.floor(rand() * 3)] : null,
        transmission: isCar ? ["manual", "automatic"][Math.floor(rand() * 2)] : null,
        seats: isCar ? 5 : null,
        area: isCar ? null : 40 + Math.floor(rand() * 160),
        rooms: isCar ? null : 1 + Math.floor(rand() * 4),
        year: isCar ? 2020 + Math.floor(rand() * 6) : null,
        officeType: null,
        rentalPeriod: isCar ? "daily" : "monthly",
        amenities: isCar ? null : JSON.stringify(["wifi", "parking"]),
        createdAt: new Date(2026, 0, 1 + (i % 28)).toISOString(),
      });
    }
  }

  return items;
}

/** Wraps items in the exact envelope tRPC v11 + superjson returns. */
export function tRPCSearchBody(items) {  return JSON.stringify([
    {
      result: {
        data: {
          json: {
            items,
            total: items.length,
            page: 1,
            pageSize: 200,
            hasMore: false,
          },
        },
      },
    },
  ]);
}

export const FIXTURE_CITY_NAMES = CITIES.map((c) => c.name);

/**
 * Uses the app's real classifier, imported from `shared/listingCategory.ts`
 * (Node strips the types) rather than re-extracted from a source file, because a
 * copy of the rule only tests the copy — and because that extraction broke the
 * moment the patterns moved out of `client/src/lib/categories.ts`.
 *
 * Kept as a function so a caller can point it at another root when checking
 * fixtures from a different tree.
 */
export function loadAppCategoryClassifier() {
  return isCarCategory;
}

/**
 * Returns fixtures whose real classification disagrees with their intent.
 *
 * Intent is set membership of the category lists above rather than a regex over
 * the category text, so adding a category shows up here as a real disagreement
 * instead of being quietly redefined by the same expression being tested.
 */
export function findMisclassifiedFixtures() {
  const cars = new Set(CAR_CATEGORIES);
  const stays = new Set(PROP_CATEGORIES);
  return buildMapFixtures()
    .map((f) => ({
      id: f.id,
      category: f.category,
      intendedCar: cars.has(f.category),
      isCar: isCarCategory(f.category),
    }))
    .filter((f) => f.intendedCar !== f.isCar || (!f.intendedCar && !stays.has(f.category)));
}
