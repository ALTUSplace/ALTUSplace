/**
 * Probes the shared listing-category classifier with real UTF-8 input.
 *
 * This exists because the misroute it guards against was invisible: a shop
 * (`محل تجاري`) and a house (`دار`) both classified as vehicles, so a property
 * marker opened `/car/<id>`. No test failed, no type error, nothing in the
 * console — just a wrong link.
 *
 * It imports `shared/listingCategory.ts` directly (Node strips the types) rather
 * than re-declaring the word lists, because a probe that copies the patterns
 * only tests the copy. The runtime client/server parity check lives in
 * `tests/unit/listing-category.test.ts`, which can resolve the `@shared` alias;
 * what is checked here is that both sides *delegate* to the one module, so they
 * cannot drift apart again.
 *
 * Written as a file rather than an inline command because PowerShell mangles
 * Arabic literals, which would silently produce a false answer.
 */
import { readFileSync } from "node:fs";
import { isCarCategory, isRecognisedListingCategory } from "../shared/listingCategory.ts";

/** Categories the platform can store that are vehicles. */
const VEHICLES = [
  ["car", "PartnerDashboard option / seed"],
  ["SUV / سيارة رباعية", "AddCar form"],
  ["سيارة فاخرة / Luxury", "AddCar form"],
  ["سيارة اقتصادية / Economy", "AddCar form"],
  ["سيدان عائلية / Sedan", "AddCar form — no 'سيارة', no 'car'"],
  ["سيارات فاخرة", "FilterBottomSheet"],
  ["Car Rental", "server requirements test"],
  ["سيارة", "Arabic"],
  ["سيارات", "Arabic plural"],
  ["مركبة", "truck / vehicle"],
  ["4x4", "Latin"],
  ["sedan", "Latin"],
  ["van", "Latin"],
  ["motorcycle", "Latin"],
  ["حافلة", "bus"],
  ["تاكسي", "taxi"],
  // French. `voiture` and `véhicule` are the commonest French words for a car
  // and both were missing while the rarer `berline`/`camion` were present, so a
  // French vehicle listing fell through to the property default: property card,
  // /property/<id>, and an identity document demanded where a driving licence
  // is required. The seed already writes "Location voiture à Casablanca".
  ["voiture", "French — the commonest word for a car, was missing"],
  ["voitures", "French plural"],
  ["véhicule", "French"],
  ["véhicules", "French plural"],
  ["vehicule", "French, unaccented as pasted"],
  ["vélo", "French"],
  ["autocar", "French coach"],
  ["fourgon", "French van"],
  ["citadine", "French city car"],
  ["tracteur", "French tractor"],
  ["motocyclette", "French motorcycle"],
  ["trois-roues", "French three-wheeler"],
  ["monospace", "Renault Kangoo Monospace body style"],
];

/** Categories the platform can store that are stays. */
const STAYS = [
  ["real_estate", "PartnerDashboard option / seed"],
  ["property", "seed"],
  ["apartment", "catalogue"],
  ["office", "HostDashboard"],
  ["شقة", "demoSeed"],
  ["شقق مفروشة", "FilterBottomSheet"],
  ["فلل", "FilterBottomSheet"],
  ["محل تجاري", "REPORTED MISROUTE — used to open /car/<id>"],
  ["دار", "REPORTED MISROUTE — used to open /car/<id>"],
  ["محل", "shop"],
  ["مكتب", "office"],
  ["فندق", "hotel"],
  ["أرض", "land"],
  ["استوديو", "studio"],
  ["رياض", "riad"],
  ["مستودع", "warehouse"],
  ["villa", "Latin"],
  ["bureau", "French"],
  ["salle de réunion", "French"],
  ["local commercial", "French"],
  ["terrain", "French"],
];

/** Values with no word in either list. They must fall through to the property default. */
const UNRECOGNISED = [
  ["سوق", "market — not a listing category"],
  ["construction", "not a listing category"],
  ["", "empty string"],
];

const pad = (s, n) => String(s).padEnd(n);

console.log("=== vehicles (expect CAR -> /car/<id>) ===");
let vehicleFailures = 0;
for (const [category, note] of VEHICLES) {
  const isCar = isCarCategory(category);
  if (!isCar) vehicleFailures += 1;
  console.log(`  ${pad(category, 26)} ${pad(isCar ? "car" : "PROPERTY", 9)} ${isRecognisedListingCategory(category) ? "" : "(unrecognised!)"}  ${note}`);
}

console.log("");
console.log("=== stays (expect PROPERTY -> /property/<id>) ===");
let stayFailures = 0;
for (const [category, note] of STAYS) {
  const isCar = isCarCategory(category);
  if (isCar) stayFailures += 1;
  console.log(`  ${pad(category, 26)} ${pad(isCar ? "CAR  <-- MISROUTED" : "property", 20)}  ${note}`);
}

console.log("");
console.log("=== unrecognised (expect the property default) ===");
let unknownFailures = 0;
for (const [category, note] of UNRECOGNISED) {
  const isCar = isCarCategory(category);
  if (isCar) unknownFailures += 1;
  console.log(`  ${pad(JSON.stringify(category), 26)} ${pad(isCar ? "CAR" : "property", 9)}  ${note}`);
}

// Structural parity: the two sides must not each carry their own word lists
// again. The runtime version of this assertion is the parity test in
// tests/unit/listing-category.test.ts.
console.log("");
console.log("=== delegation ===");
const clientSrc = readFileSync("client/src/lib/categories.ts", "utf8");
const serverSrc = readFileSync("server/verification/requirements.ts", "utf8");
const structural = [
  ["client re-exports the shared classifier", /from\s*"@shared\/listingCategory"/.test(clientSrc)],
  ["client defines no word list of its own", !/HINTS\s*=/.test(clientSrc)],
  ["server delegates to the shared classifier", /classifyListingKind\(category\)/.test(serverSrc)],
  ["server defines no word list of its own", !/HINTS\s*=/.test(serverSrc)],
];
let structuralFailures = 0;
for (const [label, ok] of structural) {
  if (!ok) structuralFailures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
}

const total = vehicleFailures + stayFailures + unknownFailures + structuralFailures;
console.log("");
if (total > 0) {
  console.log(`FAILED — ${vehicleFailures} vehicle(s) routed to /property, ${stayFailures} stay(s) routed to /car, ` +
    `${unknownFailures} unrecognised value(s) routed to /car, ${structuralFailures} delegation problem(s)`);
  process.exit(1);
}
console.log(
  `PASS — ${VEHICLES.length} vehicles, ${STAYS.length} stays and ${UNRECOGNISED.length} unrecognised values all classify correctly, ` +
    "and both sides delegate to one module",
);
