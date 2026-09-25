import { listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";
import { CATALOG_ITEMS } from "../client/src/data/catalog";

/**
 * Demo catalog seed — mirrors the static LISTINGS in
 * client/src/data/altusplace.ts and supplements them with the structured
 * CATALOG_ITEMS dataset (client/src/data/catalog.ts) — the two verified
 * daily/monthly-rental apartments (Beauséjour/Bousigour 3 rooms 140 m2 /
 * Racine 2 rooms 60 m2), both in Casablanca. The car-rental fleet (Duster,
 * Clio, 208, Tucson, CLA, Wrangler) was permanently removed from this showcase,
 * so this seed only
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
    title: "شقة مؤثثة 3 غرف 140 م² — بوسيجور، الدار البيضاء",
    description:
      "شقة للكراء اليومي في بوسيجور، الدار البيضاء. اكتشفوا هذه الشقة الجميلة المعروضة للكراء اليومي، والواقعة في حي بوسيجور الراقي.",
    category: "شقة",
    pricePerDay: 700,
    imageUrl:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    ],
    city: "بوسيجور، الدار البيضاء",
    lat: 33.5869,
    lng: -7.6095,
    rooms: 3,
    area: 140,
    floor: 4,
    propertyType: "شقة",
    rentalPeriod: "daily",
    amenities:
      "صالة معيشة واسعة، مطبخ عصري مجهز بالكامل، حمام رخام فاخر، تصميم داخلي عصري راقٍ، واي فاي، تكييف الهواء",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  },
  {
    title: "شقة مفروشة غرفتان 60 م² — راسين، الدار البيضاء",
    description:
      "شقة مفروشة في قلب حي راسين، الدار البيضاء — غرفتان، 60 م²، مشرقة وهادئة، قريبة من شارع الأميرال ومنطقة الوقوف. مثالية للكراء الشهري للعائلات والمقاولين.",
    category: "شقة",
    pricePerDay: 500,
    imageUrl:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
    ],
    city: "راسين، الدار البيضاء",
    lat: 33.5897,
    lng: -7.6321,
    rooms: 2,
    area: 60,
    floor: 2,
    propertyType: "شقة",
    rentalPeriod: "monthly",
    amenities:
      "تكييف الهواء، مطبخ مجهز، موقف سيارات، واي فاي، فرش كامل، موقع مركزي",
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
  rooms: item.specs.rooms ? Number.parseInt(String(item.specs.rooms).match(/\d+/)?.[0] ?? "", 10) : undefined,
  area: item.specs.area ? Number.parseInt(String(item.specs.area).match(/\d+/)?.[0] ?? "", 10) : undefined,
  floor: item.specs.floor ? Number.parseInt(String(item.specs.floor).match(/\d+/)?.[0] ?? "", 10) : undefined,
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
