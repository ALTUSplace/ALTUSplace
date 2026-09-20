import { listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";
import { CATALOG_ITEMS } from "../client/src/data/catalog";

/**
 * Demo catalog seed — mirrors the static LISTINGS in client/src/data/altusplace.ts
 * and supplements them with the structured CATALOG_ITEMS dataset
 * (client/src/data/catalog.ts) — the single verified daily-rental apartment
 * (Beauséjour) plus the Dacia Duster 2026, Renault Clio 2026, Jeep Wrangler 2025.
 *
 * Runs once per boot when the `listings` table is empty and a DATABASE_URL is
 * configured, so the marketplace (Search, filtering, car detail, and real
 * booked-transactions) works end-to-end with persistent bookings against
 * numeric listing ids. The client-side static fallback remains purely for the
 * offline / no-DB case.
 */

const DEMO_OWNER_OPENID = "demo-owner-altusplace";
const DEMO_OWNER_NAME = "فريق المنصة ALTUSplace";

type DemoListingRow = Omit<typeof listings.$inferInsert, "ownerId">;

const EXISTING_DEMO_LISTINGS: DemoListingRow[] = [
  {
    title: "رينو كليو",
    description: "سيارة اقتصادية ومريحة، ممتازة للتنقل في المدن المغربية والمطارات.",
    category: "سيارة اقتصادية / City",
    pricePerDay: 250,
    imageUrl: "/car-photos/car1.webp",
    images: ["/car-photos/car1.webp"],
    city: "الدار البيضاء",
    fuelType: "بنزين / ديزل",
    transmission: "أوتوماتيك",
    seats: 5,
    year: 2020,
  },
  {
    title: "RENALD كليو (Renault Clio)",
    description: "السيارة الأكثر طلباً للتنقل الحضري في الدار البيضاء ومحطة قطار محمد الخامس والمطارات.",
    category: "سيارة اقتصادية / City",
    pricePerDay: 280,
    imageUrl: "/car-photos/car3.webp",
    images: ["/car-photos/car3.webp"],
    city: "الدار البيضاء",
    fuelType: "بنزين / ديزل",
    transmission: "أوتوماتيك",
    seats: 5,
    year: 2021,
    amenities: "اقتصادية جداً في الوقود, حساسات وقوف, بلوتوث ونظام صوتي متطور, تكييف هواء",
  },
  {
    title: "شقة مؤثثة 3 غرف 140 م²",
    description: "شقة للكراء اليومي في بوسيجور، الدار البيضاء. اكتشفوا هذه الشقة الجميلة المعروضة للكراء اليومي، والواقعة في حي بوسيجور الراقي.",
    category: "شقة",
    pricePerDay: 700,
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
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
    amenities: "صالة معيشة واسعة, مطبخ عصري مجهز بالكامل, حمام رخام فاخر, تصميم داخلي عصري راقٍ, واي فاي, مكيف هواء, كراء يومي",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  },
];

/** Catalog showcase rows (client/src/data/catalog.ts) mapped to DB columns. */
const CATALOG_ROWS: DemoListingRow[] = CATALOG_ITEMS.map((item) => ({
  title: item.title,
  description: item.description,
  category: item.category,
  pricePerDay: item.pricePerDay,
  imageUrl: item.imageUrl,
  images: item.images,
  city: item.city,
  lat: item.lat,
  lng: item.lng,
  pricePerMonth: item.pricePerMonth,
  rentalPeriod: item.rentalPeriod,
  propertyType: item.propertyType,
  officeType: item.officeType,
  rooms: item.rooms,
  area: item.area,
  floor: item.floor,
  seats: item.seats,
  year: item.year,
  transmission: item.transmission,
  fuelType: item.fuelType,
  amenities: item.features.join(", "),
  ...(item.createdAt ? { createdAt: item.createdAt } : {}),
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
    logger.warn("[DemoSeed] No database configured — skipping demo seed.");
    return;
  }
  try {
    const existing = await db.select({ id: listings.id }).from(listings).limit(1);
    if (existing.length > 0) return;

    let owner = (await db.select({ id: users.id }).from(users).where(eq(users.openId, DEMO_OWNER_OPENID)).limit(1))[0];
    if (!owner) {
      const [inserted] = await db
        .insert(users)
        .values({ openId: DEMO_OWNER_OPENID, name: DEMO_OWNER_NAME, role: "owner", accountStatus: "active" })
        .returning({ id: users.id });
      owner = inserted;
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