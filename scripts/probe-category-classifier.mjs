/**
 * Probes client/src/lib/categories.ts PROPERTY_HINTS with real UTF-8 input.
 *
 * Written as a file rather than an inline command because PowerShell mangles
 * Arabic literals, which would silently produce a false answer here.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("client/src/lib/categories.ts", "utf8");
const match = src.match(/PROPERTY_HINTS\s*=\s*\/([\s\S]*?)\/i/);
if (!match) {
  console.error("could not extract PROPERTY_HINTS");
  process.exit(2);
}
const hints = new RegExp(match[1], "i");
const isCarCategory = (c) => c === "car" || !hints.test(c);

const candidates = [
  ["سيارة", "car (Arabic)"],
  ["car", "car (latin)"],
  ["سيارة مدينة", "city car"],
  ["شقة", "apartment"],
  ["محل تجاري", "commercial shop"],
  ["property", "property (latin)"],
  ["مكتب", "office"],
  ["فيلا", "villa"],
  ["دار", "house"],
  ["أparametric", "unknown ascii"],
  ["سوق", "unknown arabic"],
  ["construction", "unknown latin"],
];

console.log("PROPERTY_HINTS literal length:", match[1].length);
console.log("");
console.log("category".padEnd(22), "isCarCategory", " meaning");
for (const [cat, note] of candidates) {
  const isCar = isCarCategory(cat);
  console.log(
    cat.padEnd(22),
    String(isCar).padEnd(14),
    isCar ? "CAR  <- routed to /car/" : "PROPERTY -> routed to /property/",
    `  (${note})`,
  );
}

const misrouted = candidates.filter(([c]) => isCarCategory(c) && /شقة|محل|مكتب|دار|فيلا/.test(c));
console.log("");
if (misrouted.length) {
  console.log("PROPERTY-LOOKING CATEGORIES CLASSIFIED AS CARS:");
  for (const [c, note] of misrouted) console.log(`  "${c}" (${note})`);
} else {
  console.log("all sampled property categories classified correctly");
}
