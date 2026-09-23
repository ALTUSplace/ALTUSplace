/**
 * Demo-gated, idempotent, deterministic review seed.
 *
 * Guards (honest production behavior):
 *  - Executes ONLY when DEMO_SEED=1 — production never sets it, so nothing here
 *    can ever run on a live deployment.
 *  - Targets ONLY listings owned by the demo owner (openId "demo-owner-altusplace").
 *    Real partner listings are never touched — no fake reviews on real inventory.
 *  - Idempotent: skips entirely when a previous run's marker rows exist
 *    (demo renter users with the openId prefix `demo-renter-review-`).
 *
 * The demo renters own Confirmed, already-ended demo bookings so every seeded
 * review satisfies the exact preconditions `reviews.create` enforces on real
 * submissions (own confirmed ended booking for that listing, one per booking).
 * `demoCleanup` already removes reviews + bookings by demo listing id.
 */
import { eq, ilike, inArray, and } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { bookings, listings, reviews, users } from "../../drizzle/schema";
import type { getDb } from "../db";

export type SeedDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const DEMO_OWNER_OPENID = "demo-owner-altusplace";
export const RENTER_OPENID_PREFIX = "demo-renter-review-";
export const TARGET_TOTAL_REVIEWS = 30;

/** Weighted toward 4-5 stars: mean = 26/6 ≈ 4.33. */
const RATING_POOL = [5, 5, 5, 4, 4, 3] as const;

const FIRST_NAMES = [
  "إلياس", "نادية", "سمية", "نبيل", "فاطمة", "مريم",
  "عمر", "خديجة", "يوسف", "سلمى", "أمين", "ليلى",
  "هشام", "رشيد", "منال", "كريم", "وفاء", "جواد",
] as const;

const COMMENTS_AR = [
  "تجربة ممتازة من البداية للنهاية، التعامل كان راقياً والسعر مناسب جداً.",
  "الوكالة جادة والمواعيد مضبوطة، السيارة كانت نظيفة وفي حالة ممتازة.",
  "الشقة مطابقة للصور والموقع ممتاز، كل الخدمات قريبة.",
  "استأجرت لعطلة نهاية الأسبوع، تجربة مريحة وسلسة من الحجز حتى التسليم.",
  "خدمة العملاء سريعة والرد فوري، شكراً على الاحترافية.",
  "مكان نظيف ومرتب وترحيب حار، سأكرر التجربة بكل تأكيد.",
  "التعامل كان احترافياً والتوصيل في الموعد المحدد تماماً.",
  "قيمة ممتازة مقابل السعر، أنصح به بشدة.",
] as const;

const COMMENTS_FR = [
  "Excellente expérience, véhicule propre et conforme aux photos.",
  "Agence très professionnelle, remise et retour sans aucun problème.",
  "Appartement propre et conforme aux photos, quartier calme et pratique.",
  "Très bonne expérience, je reviendrai sans hésiter.",
  "Location simple et rapide, bon rapport qualité/prix.",
  "Accueil chaleureux et service réactif, je recommande.",
  "Tout s'est passé comme prévu, véhicule en parfait état.",
  "Très satisfait, personnel disponible et à l'écoute.",
] as const;

/** Deterministic LCG so a given run always produces the same dataset. */
function makeRandom(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Distributions: with ≥5 demo listings, 60% get 3-8 reviews, 30% get 1-2,
 * 10% get zero. With fewer demo listings the 60/30/10 bands cannot both fill
 * the 3-8 band AND reach the 30-40 total, so the 3-8 band is saturated
 * (documented in the seed log line it prints).
 */
export function distributeTargets(listingCount: number, random: () => number): number[] {
  if (listingCount <= 4) {
    const base = Math.floor(TARGET_TOTAL_REVIEWS / listingCount);
    const extra = TARGET_TOTAL_REVIEWS % listingCount;
    return Array.from({ length: listingCount }, (_, i) => Math.min(8, base + (i < extra ? 1 : 0)));
  }
  const heavy = Math.round(listingCount * 0.6);
  const light = Math.round(listingCount * 0.3);
  const zero = listingCount - heavy - light;
  const counts: number[] = [];
  for (let i = 0; i < heavy; i += 1) counts.push(3 + Math.floor(random() * 6)); // 3-8
  for (let i = 0; i < light; i += 1) counts.push(1 + Math.floor(random() * 2)); // 1-2
  for (let i = 0; i < zero; i += 1) counts.push(0);
  return counts;
}

export type SeedResult = {
  skipped: "already-seeded" | "no-demo-listings" | null;
  listings: number;
  reviews: number;
  overallAverage: number;
  perListing: Array<{ listingId: number; rows: number }>;
};

/** Seeds demo reviews through any drizzle db (real or test fake). */
export async function seedDemoReviews(db: SeedDb): Promise<SeedResult> {
  const empty: SeedResult = { skipped: null, listings: 0, reviews: 0, overallAverage: 0, perListing: [] };

  // Idempotency marker: a previous run's demo renters (or any review of theirs)
  // mean the demo set already exists — skip entirely.
  const marker = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.openId, `${RENTER_OPENID_PREFIX}%`))
    .limit(1);
  if (marker.length > 0) {
    return { ...empty, skipped: "already-seeded" };
  }

  const demoListings = await db
    .select({ id: listings.id, pricePerDay: listings.pricePerDay })
    .from(listings)
    .innerJoin(users, eq(listings.ownerId, users.id))
    .where(and(eq(users.openId, DEMO_OWNER_OPENID), inArray(listings.status, ["Published"])));
  if (demoListings.length === 0) {
    return { ...empty, skipped: "no-demo-listings" };
  }

  const random = makeRandom();
  const targets = distributeTargets(demoListings.length, random);

  // Build review specs (rating/comment/name/booking window) deterministically.
  const specs: Array<{ listingId: number; pricePerDay: number; rating: number; comment: string; name: string; startAt: Date; endAt: Date; createdAt: Date }> = [];
  demoListings.forEach((listing, listingIndex) => {
    for (let i = 0; i < targets[listingIndex]; i += 1) {
      const rating = RATING_POOL[Math.floor(random() * RATING_POOL.length)];
      const pool = specs.length % 2 === 0 ? COMMENTS_AR : COMMENTS_FR;
      const comment = pool[Math.floor(random() * pool.length)];
      const name = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)];
      const endOffsetDays = 7 + Math.floor(random() * 38); // Confirmed + already ended
      const endAt = new Date(Date.now() - endOffsetDays * 24 * 60 * 60 * 1000);
      const startedAt = new Date(endAt.getTime() - (2 + Math.floor(random() * 3)) * 24 * 60 * 60 * 1000);
      specs.push({
        listingId: listing.id,
        pricePerDay: listing.pricePerDay,
        rating,
        comment,
        name,
        startAt: startedAt,
        endAt,
        createdAt: new Date(endAt.getTime() + 24 * 60 * 60 * 1000),
      });
    }
  });

  const renterUsers = await db
    .insert(users)
    .values(
      specs.map((spec, index) => ({
        openId: `${RENTER_OPENID_PREFIX}${String(index + 1).padStart(3, "0")}`,
        name: spec.name,
      })),
    )
    .returning({ id: users.id });
  if (renterUsers.length !== specs.length) {
    throw new Error("demo review seed: renter user insert returned fewer rows than expected");
  }

  const insertedBookings = await db
    .insert(bookings)
    .values(
      specs.map((spec, index) => ({
        renterId: renterUsers[index].id,
        listingId: spec.listingId,
        status: "Confirmed" as const,
        startDate: spec.startAt,
        endDate: spec.endAt,
        totalPrice: spec.pricePerDay * 3,
        commissionFee: Math.round(spec.pricePerDay * 3 * 0.1),
        netProfit: Math.round(spec.pricePerDay * 3 * 0.9),
      })),
    )
    .returning({ id: bookings.id });
  if (insertedBookings.length !== specs.length) {
    throw new Error("demo review seed: booking insert returned fewer rows than expected");
  }

  await db
    .insert(reviews)
    .values(
      specs.map((spec, index) => ({
        userId: renterUsers[index].id,
        listingId: spec.listingId,
        bookingId: insertedBookings[index].id,
        rating: spec.rating,
        comment: spec.comment,
        createdAt: spec.createdAt,
      })),
    );

  const perListing = demoListings.map((listing, listingIndex) => ({
    listingId: listing.id,
    rows: targets[listingIndex],
  }));
  const overallAverage = specs.reduce((sum, spec) => sum + spec.rating, 0) / specs.length;

  return {
    skipped: null,
    listings: demoListings.length,
    reviews: specs.length,
    overallAverage: Math.round(overallAverage * 100) / 100,
    perListing,
  };
}

function loadConnectionString(): string {
  const root = resolve(process.cwd());
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (existsSync(resolve(root, ".env"))) {
    const text = readFileSync(resolve(root, ".env"), "utf8");
    const match = text.match(/^(?:DATABASE_URL|SUPABASE_DB_URL)=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required to seed");
}

async function main(): Promise<void> {
  if (process.env.DEMO_SEED !== "1") {
    console.log("[reviews-seed] DEMO_SEED not set — skipping (demo reviews would never run in production).");
    return;
  }
  const client = postgres(loadConnectionString(), { max: 1, onnotice: () => {} });
  const db = drizzle(client);
  try {
    const result = await seedDemoReviews(db);
    if (result.skipped === "already-seeded") {
      console.log("[reviews-seed] marker rows found — skipping (idempotent).");
      return;
    }
    if (result.skipped === "no-demo-listings") {
      console.log("[reviews-seed] no demo-owned published listings — nothing to seed.");
      return;
    }
    console.log(
      `[reviews-seed] seeded ${result.reviews} demo reviews across ${result.listings} demo listing(s); ` +
        `overall mean ${result.overallAverage.toFixed(2)}; per listing: ` +
        result.perListing.map((entry) => `#${entry.listingId}=${entry.rows}`).join(", ") +
        ` (with <5 demo listings the 3-8 band is saturated to reach ${TARGET_TOTAL_REVIEWS}+).`,
    );
  } finally {
    await client.end();
  }
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error("[reviews-seed] failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}