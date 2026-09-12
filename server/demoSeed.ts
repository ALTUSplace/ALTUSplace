import { listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";

/**
 * Demo catalog seed — mirrors the static LISTINGS in client/src/data/altusplace.ts.
 *
 * Runs once per boot when the `listings` table is empty and a DATABASE_URL is
 * configured, so the marketplace (Search, filtering, property/car detail, and
 * real booked-transactions) works end-to-end with persistent bookings against
 * numeric listing ids. The client-side static fallback remains purely for the
 * offline / no-DB case.
 */

const DEMO_OWNER_OPENID = "demo-owner-altusplace";
const DEMO_OWNER_NAME = "فريق المنصة ALTUSplace";

type DemoListingRow = Omit<typeof listings.$inferInsert, "ownerId">;

const DEMO_LISTINGS: DemoListingRow[] = [
  {
    title: "داسيا سانديرو (Dacia Sandero)",
    description: "سيارة دفع رباعي اقتصادية وقوية، ممتازة للطرق الوعرة والمدن المغربية. تشمل التأمين الشامل والصيانة الدورية.",
    category: "سيارة رباعية / SUV",
    pricePerDay: 300,
    imageUrl: "/car-photos/car1.webp",
    city: "أغادير",
    fuelType: "بنزين / ديزل",
    transmission: "يدوي (Manual)",
  },
  {
    title: "شقة عصرية فاخرة مع مسبح في جليز",
    description: "شقة مفروشة بتصميم راقٍ في قلب حي جليز الراقي بمراكش. قريبة من جميع المطاعم والمقاهي والأماكن السياحية.",
    category: "شقة مفروشة / Apartment",
    pricePerDay: 950,
    imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    city: "مراكش",
    rooms: 2,
    amenities: "مسبح مشترك, واي فاي سريع, أمن 24/7, موقف سيارات خاص, شرفة بإطلالة بانورامية",
  },
  {
    title: "رينو كليو (Renault Clio)",
    description: "السيارة الأكثر طلباً للتنقل الحضري في الدار البيضاء ومحطة قطار محمد الخامس والمطارات.",
    category: "سيارة اقتصادية / City",
    pricePerDay: 250,
    imageUrl: "/car-photos/car3.webp",
    city: "الدار البيضاء",
    fuelType: "بنزين / ديزل",
    transmission: "أوتوماتيك",
    amenities: "اقتصادية جداً في الوقود, حساسات وقوف, بلوتوث ونظام صوتي متطور, تكييف هواء",
  },
  {
    title: "مكتب خاص راقٍ في مركز مراكش",
    description: "مكتب خاص مجهز للشركات الناشئة والمهنيين، بموقع مركزي وخدمات استقبال احترافية.",
    category: "مكتب خاص / Bureau privé",
    pricePerDay: 1800,
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80",
    city: "مراكش",
    officeType: "private",
    rentalPeriod: "monthly",
    amenities: "fiber,air_conditioning,reception,parking",
  },
  {
    title: "مساحة عمل مشتركة للشركات في كازا",
    description: "Coworking مرن لرواد الأعمال والفرق الصغيرة مع إنترنت سريع ومرافق مشتركة.",
    category: "Coworking / مساحة مشتركة",
    pricePerDay: 120,
    imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
    city: "الدار البيضاء",
    officeType: "coworking",
    rentalPeriod: "daily",
    amenities: "fiber,air_conditioning,reception",
  },
  {
    title: "قاعة اجتماعات مجهزة في جليز",
    description: "قاعة اجتماعات مهنية لاستقبال العملاء وتنظيم الاجتماعات والورشات في موقع مركزي.",
    category: "قاعة اجتماعات / Salle de réunion",
    pricePerDay: 650,
    imageUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80",
    city: "مراكش",
    officeType: "meeting_room",
    rentalPeriod: "daily",
    amenities: "fiber,air_conditioning,reception,security",
  },
  {
    title: "مقر شركة جاهز في المعاريف",
    description: "مقر مهني قابل للتخصيص للشركات مع استقبال وحراسة ومرافق مناسبة للتسجيل الإداري.",
    category: "مقر شركة / Siège d'entreprise",
    pricePerDay: 9500,
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80",
    city: "الدار البيضاء",
    rooms: 6,
    officeType: "company_headquarters",
    rentalPeriod: "monthly",
    amenities: "fiber,air_conditioning,parking,security",
  },
  {
    title: "فيلا مطلة على البحر في أشقار",
    description: "فيلا استثنائية للاستجمام العائلي في منطقة أشقار بطنجة بالقرب من مغارة هركليس.",
    category: "فيلا فاخرة / Villa",
    pricePerDay: 3500,
    imageUrl: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80",
    city: "طنجة",
    rooms: 4,
    amenities: "إطلالة مباشرة على المحيط, مسبح خاص, حديقة واسعة, طباخ خاص عند الطلب, جراج لسيارتين",
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