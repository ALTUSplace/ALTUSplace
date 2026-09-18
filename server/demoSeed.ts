import { listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";

/**
 * Demo catalog seed — mirrors the static LISTINGS in client/src/data/altusplace.ts.
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

const DEMO_LISTINGS: DemoListingRow[] = [
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
    title: "شقة في الدار البيضاء",
    description: "شقة مفروشة بالكامل وقريبة من وسط المدينة، مثالية للعائلات والكراء الشهري.",
    category: "شقة",
    pricePerDay: 800,
    imageUrl: null,
    images: [],
    city: "الدار البيضاء",
    rooms: 3,
    area: 95,
    floor: 2,
    propertyType: "شقة",
    rentalPeriod: "monthly",
    pricePerMonth: 12000,
  },
  {
    title: "شقة مفروشة بأكادير",
    description: "شقة واسعة ومريحة، مثالية للإقامات الطويلة والكراء الشهري.",
    category: "شقة",
    pricePerDay: 600,
    imageUrl: null,
    images: [],
    city: "أغادير",
    rooms: 2,
    area: 70,
    floor: 3,
    propertyType: "شقة",
    rentalPeriod: "monthly",
    pricePerMonth: 9000,
  },
];

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