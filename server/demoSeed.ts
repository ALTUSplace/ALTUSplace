import { listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";
import { CATALOG_ITEMS } from "../client/src/data/catalog";

/**
 * Demo catalog seed — mirrors the static LISTINGS in
 * client/src/data/altusplace.ts and supplements them with the structured
 * CATALOG_ITEMS dataset (client/src/data/catalog.ts) — the two verified
 * daily/monthly-rental apartments (Beausejour 3-rooms 140 m2 / Racine 2-rooms
 * 60 m2), both in Casablanca. The car-rental fleet (Duster, Clio, 208, Tucson,
 * CLA, Wrangler) was permanently removed from this showcase, so this seed only
 * inserts property rows locked to the two verified apartments in order to make
 * Search, filtering, property detail, and real booked-transactions work
 * end-to-end with persistent bookings against numeric listing ids.
 *
 * Runs once per boot when the `listings` table is empty and a DATABASE_URL is
 * configured. The client-side static fallback remains purely for the
 * offline / no-DB case.
 */

const DEMO_OWNER_OPENID = "demo-owner-altusplace";
const DEMO_OWNER_NAME = "ALTUSplace Team";

type DemoListingRow = Omit<typeof listings.$inferInsert, "ownerId">;

const EXISTING_DEMO_LISTINGS: DemoListingRow[] = [
  {
    title: "Shuqqa mu'aththatha 3 ghuraf 140 m2 - Beausejour, Casablanca",
    description:
      "Shuqqa lil-kira' al-yawmi fi Bousigour, Casablanca. Discover this lovely apartment offered for daily rental, located in the upscale Bousigour neighborhood.",
    category: "Shaqqa / Appartement",
    pricePerDay: 700,
    imageUrl:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    ],
    city: "Bousigour, Casablanca",
    lat: 33.5869,
    lng: -7.6095,
    rooms: 3,
    area: 140,
    floor: 4,
    propertyType: "Shaqqa",
    rentalPeriod: "daily",
    amenities:
      "Spacious living room, fully equipped modern kitchen, luxurious marble bathroom, modern upscale interior design, Wifi, Air conditioning",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  },
  {
    title: "Furnished apartment 2 rooms 60 m2 - Racine, Casablanca",
    description:
      "Furnished apartment in the heart of Racine, Casablanca - 2 rooms, 60 m2, bright and quiet, close to Avenue de l'Amiral and parking. Ideal for monthly rental for families and business.",
    category: "Shaqqa / Appartement",
    pricePerDay: 500,
    imageUrl:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
    ],
    city: "Racine, Casablanca",
    lat: 33.5897,
    lng: -7.6321,
    rooms: 2,
    area: 60,
    floor: 2,
    propertyType: "Shaqqa",
    rentalPeriod: "monthly",
    amenities:
      "Air conditioning, equipped kitchen, parking, Wifi, full furnishing, central location",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  },
];

/** Catalog showcase rows (client/src/data/catalog.ts) mapped to DB columns. */
const CATALOG_ROWS: DemoListingRow[] = CATALOG_ITEMS.map((item) => ({
  title: item.title,
  description: item.description,
  category: item.category,
  pricePerDay: item.pricePerUnit,
  pricePerMonth: item.monthlyRentEnabled ? item.pricePerUnit : undefined,
  imageUrl: item.image,
  images: item.images,
  city: item.city,
  rooms: item.specs.rooms,
  area: item.specs.area,
  floor: item.specs.floor,
  propertyType: item.propertyType,
  rentalPeriod: item.dailyRentEnabled ? "daily" : item.monthlyRentEnabled ? "monthly" : undefined,
  amenities: item.features.join(", "),
  ...(item.specs.year ? { year: item.specs.year } : {}),
}));

const DEMO_LISTINGS: DemoListingRow[] = [...EXISTING_DEMO_LISTINGS, ...CATALOG_ROWS];

let seedPromise: Promise<void> | null = null;

export function ensureDemoData(): Promise<void> {
  if (!seedPromise) seedPromise = runSeed();
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const db = await getDb();
  if (!db) {
    logger.warn("[DemoSeed] No database configured - skipping demo seed.");
    return;
  }
  try {
    const existing = await db.select({ id: listings.id }).from(listings).limit(1);
    if (existing.length > 0) return;

    let owner = (
      await db.select({ id: users.id }).from(users).where(eq(users.openId, DEMO_OWNER_OPENID)).limit(1)
    )[0];
    if (!owner) {
      const inserted = await db
        .insert(users)
        .values({ openId: DEMO_OWNER_OPENID, name: DEMO_OWNER_NAME })
        .returning({ id: users.id });
      owner = inserted[0];
    }

    await db.insert(listings).values(
      DEMO_LISTINGS.map((row) => ({ ...row, ownerId: owner.id, status: "Published" as const })),
    );
    logger.info(`[DemoSeed] Seeded ${DEMO_LISTINGS.length} demo listings under owner #${owner.id}.`);
  } catch (error) {
    logger.warn("[DemoSeed] Seeding skipped (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
