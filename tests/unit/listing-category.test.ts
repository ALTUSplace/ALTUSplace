/**
 * Contract test for listing category classification.
 *
 * Why this exists: the client and the server used to carry separate regexes
 * with opposite defaults. The client asked "is this a car unless it looks like
 * property?" while `normalizeBookingCategory` asked "is this a car only if it
 * looks like one?". The two therefore disagreed on every value outside the
 * intersection of their word lists, and a commercial shop (`محل تجاري`) and a
 * house (`دار`) both rendered a car card and linked to `/car/<id>` on the
 * client. Nothing failed: no error, no type error, no failed test — the shop
 * simply opened a car detail page.
 *
 * The word lists are now shared (`shared/listingCategory.ts`) and the default is
 * a property stay, so a *missed vehicle* word is the only remaining failure
 * mode, and it is a visible one. The fixtures below are therefore drawn from
 * what the app can actually store, not from the word lists themselves:
 *
 *   - `AddCar.tsx` writes the vehicle labels (a family sedan is
 *     `سيدان عائلية / Sedan`, which contains neither `سيارة` nor `car`),
 *   - `PartnerDashboard.tsx` and `server/demoSeed.ts` write the canonical values,
 *   - `FilterBottomSheet.tsx` and `demoSeed.ts` write the property labels.
 *
 * Two tests read those source files directly instead of trusting this table, so
 * adding an option to a form without classifying it fails here rather than in
 * production. The last test asserts the client and the server agree on every
 * fixture, which is the property that was silently false before.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { isCarCategory, isPropertyCategory, isRecognisedListingCategory } from "@shared/listingCategory";
import { normalizeBookingCategory } from "../../server/verification/requirements";

const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Vehicle categories the platform can store. A miss here routes a car to
 * `/property/<id>` and shows a property card, so this list is the one that has
 * to stay complete.
 */
const VEHICLE_CATEGORIES: readonly string[] = [
  "car", // PartnerDashboard.tsx option, and 19 rows in the seed data
  "cars",
  "Car Rental", // asserted by server/verification/requirements.test.ts
  "سيارة",
  "سيارات",
  "سيارة مدينة",
  "SUV / سيارة رباعية", // AddCar.tsx
  "سيارة فاخرة / Luxury", // AddCar.tsx
  "سيارة اقتصادية / Economy", // AddCar.tsx
  "سيدان عائلية / Sedan", // AddCar.tsx — no "سيارة", no "car"
  "سيارات فاخرة", // FilterBottomSheet.tsx
  "سيارات اقتصادية", // FilterBottomSheet.tsx
  "4x4",
  "suv",
  "sedan",
  "hatchback",
  "coupe",
  "convertible",
  "pickup",
  "minivan",
  "van",
  "truck",
  "bus",
  "taxi",
  "motorcycle",
  "scooter",
  "camion",
  "berline",
  "utilitaire",
  "مركبة",
  "شاحنة",
  "حافلة",
  "دراجة نارية",
  "تاكسي",
  "فان",
];

/** Stay categories the platform can store. */
const PROPERTY_CATEGORIES: readonly string[] = [
  "real_estate", // PartnerDashboard.tsx option, and 8 rows in the seed data
  "property",
  "Office", // seed data, capitalised
  "محل تجاري", // reported misroute: opened /car/<id>
  "دار", // reported misroute: opened /car/<id>
  "شقة", // demoSeed.ts
  "شقق مفروشة", // FilterBottomSheet.tsx
  "فلل", // FilterBottomSheet.tsx
  "محل",
  "محلات",
  "مكتب",
  "مكاتب",
  "فندق",
  "فنادق",
  "أرض",
  "استوديو",
  "رياض",
  "دوبلكس",
  "مستودع",
  "مزرعة",
  "عمارة",
  "apartment",
  "villa",
  "riad",
  "office",
  "hotel",
  "studio",
  "bureau",
  "salle de réunion",
  "local commercial",
  "terrain",
  "entrepôt",
  "maison",
];

describe("listing category classification", () => {
  it("routes every vehicle category to /car/<id>", () => {
    const wrong = VEHICLE_CATEGORIES.filter((c) => !isCarCategory(c));
    expect(wrong).toEqual([]);
  });

  it("routes every stay category to /property/<id>", () => {
    const wrong = PROPERTY_CATEGORIES.filter((c) => isCarCategory(c));
    expect(wrong).toEqual([]);
  });

  it("treats the two reported misroutes as stays", () => {
    // Regression guard for the original bug report, spelled out so the fix
    // cannot be reverted by trimming the property word list.
    expect(isCarCategory("محل تجاري")).toBe(false);
    expect(isCarCategory("دار")).toBe(false);
    expect(isPropertyCategory("محل تجاري")).toBe(true);
    expect(isPropertyCategory("دار")).toBe(true);
  });

  it("falls back to a stay for values it does not recognise", () => {
    // The default is the safe direction: the server asks for an identity
    // document, so an unknown value must demand proof rather than skip it.
    for (const unknown of ["", "   ", "سوق", "construction", "unknown-ascii"]) {
      expect(isCarCategory(unknown)).toBe(false);
    }
    expect(isCarCategory(null)).toBe(false);
    expect(isCarCategory(undefined)).toBe(false);
    expect(isRecognisedListingCategory("")).toBe(false);
    expect(isRecognisedListingCategory("سوق")).toBe(false);
  });

  it("classifies every category literal the app can actually store", () => {
    // Derived from source rather than hand-copied, so the classifier is checked
    // against what the seed data, the demo catalogue and the dashboards write.
    const sources = [
      "server/seed/demo-listings.ts",
      "server/demoSeed.ts",
      "client/src/data/catalog.ts",
      "client/src/pages/AgencyDashboard.tsx",
      "client/src/pages/HostDashboard.tsx",
    ];
    const found = new Set<string>();
    for (const rel of sources) {
      const text = readFileSync(resolve(templateRoot, rel), "utf8");
      for (const m of text.matchAll(/category:\s*"([^"]+)"/g)) found.add(m[1]);
    }
    expect(found.size).toBeGreaterThan(0);

    // Every stored value must be positively recognised, so the property default
    // is never reached by accident on real data.
    expect([...found].filter((c) => !isRecognisedListingCategory(c))).toEqual([]);

    // Explicit rather than derived, so adding a category to a form shows up as
    // a reviewable diff here instead of silently changing behaviour.
    expect([...found].filter((c) => isCarCategory(c)).sort()).toEqual(["car"]);
    expect([...found].filter((c) => isPropertyCategory(c)).sort()).toEqual([
      "apartment",
      "office",
      "property",
      "real_estate",
      "شقة",
    ]);
  });

  it("classifies every vehicle option the car form can submit", () => {
    // Parses AddCar.tsx rather than a hand-copied list, so a new option added
    // to the form fails here until the shared vocabulary covers it. Scoped to
    // the "فئة المركبة" block because the form has other selects (gearbox,
    // fuel) whose options are not listing categories.
    const form = readFileSync(resolve(templateRoot, "client/src/pages/AddCar.tsx"), "utf8");
    const block = form.match(/فئة المركبة[\s\S]*?<\/select>/);
    expect(block, "the vehicle-class select was not found in AddCar.tsx").not.toBeNull();
    const options = [...(block?.[0] ?? "").matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    expect(options).toEqual([
      "SUV / سيارة رباعية",
      "سيارة فاخرة / Luxury",
      "سيارة اقتصادية / Economy",
      "سيدان عائلية / Sedan",
    ]);
    const wrong = options.filter((value) => !isCarCategory(value));
    expect(wrong).toEqual([]);
  });

  it("matches ة written with either teh code point", () => {
    // U+0629 and U+062A render identically and both occur in listing data. A
    // regex pinned to one of them fails silently on the other, which is how
    // `سيارة` came to miss half the car catalogue.
    const teh = "\u0629"; // ة as teh
    const marbuta = "\u062A"; // ة as teh marbuta
    expect(teh).not.toBe(marbuta);
    for (const spelling of [teh, marbuta]) {
      expect(isCarCategory(`سيار${spelling} believ`)).toBe(true);
      expect(isCarCategory(`سيار${spelling}ت`)).toBe(true);
      expect(isCarCategory(`مركب${spelling}`)).toBe(true);
      expect(isPropertyCategory(`شق${spelling}`)).toBe(true);
    }
  });

  it("keeps the client and the server on the same verdict", () => {
    // The property that was silently false before: the client rendered a car
    // card for values the server treated as stays.
    const corpus = [...VEHICLE_CATEGORIES, ...PROPERTY_CATEGORIES, "", "سوق"];
    for (const category of corpus) {
      const clientSaysCar = isCarCategory(category);
      const serverSaysCar = normalizeBookingCategory(category) === "car";
      expect({ category, clientSaysCar, serverSaysCar }).toEqual({
        category,
        clientSaysCar,
        serverSaysCar,
      });
    }
  });

  it("never lists the same value as both a vehicle and a stay", () => {
    // Guards the fixture tables against a copy-paste slip, which would make the
    // parity test above pass for the wrong reason.
    expect(VEHICLE_CATEGORIES.filter((c) => PROPERTY_CATEGORIES.includes(c))).toEqual([]);
  });
});
