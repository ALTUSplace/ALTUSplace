/**
 * Demo-gated, idempotent, deterministic Moroccan demo catalog seed.
 *
 * Solves the cold-start problem: on a fresh database the marketplace looks
 * empty, so this seed populates it with a professional, realistic demo agency
 * (cars + apartments) that the search / browse / detail / booking flows can
 * operate on out of the box.
 *
 * Guards (honest production behavior):
 *  - Executes ONLY when DEMO_SEED=1 — production never sets it, so nothing
 *    here can ever run on a live deployment.
 *  - Idempotent: on a fresh database the agency (openId `demo-owner-id`) and
 *    its 10 listings are inserted once. On re-run the seed never duplicates
 *    rows; instead it refreshes the verified image URLs on the existing demo
 *    listings IN PLACE. Note the schema's owner marker is the `users.openId`
 *    string — `listings.owner_id` is an integer FK to `users.id`, so the
 *    marker is the agency identity, not a literal owner_id value.
 *  - The agency is created if missing; on re-runs only image URLs are ever
 *    touched — every other field of an existing row is left unchanged.
 *
 * Images are verified, license-safe Wikimedia Commons thumbnails whose
 * filenames match the exact car model (e.g. "2023 Dacia Duster", "Hyundai
 * Tucson", "Renault Clio", "Dacia Logan III", "Toyota Corolla", "Kia
 * Sportage") — see server/seed/demo-listings.images.test.ts.
 *
 * Category values use the modern app-wide convention ("car" / "real_estate"),
 * and `city` uses the canonical Arabic names ("الدار البيضاء", "مراكش",
 * "طنجة") so the search filter (eq on city) and category helpers resolve
 * correctly. Mileage lives in the description (no mileage DB column). Dates
 * are spread within the last 30 days so `demoCleanup` (30-day retention) does
 * not purge a freshly seeded catalog.
 */
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { listings, users } from "../../drizzle/schema";
import type { getDb } from "../db";

export type SeedDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Marker identity of the demo agency this seed manages. */
export const DEMO_AGENCY_OPENID = "demo-owner-id";

const DEMO_AGENCY_NAME = "ALTUSplace Demo Partner";

const AGENCY_USER = {
  openId: DEMO_AGENCY_OPENID,
  name: DEMO_AGENCY_NAME,
  agencyName: DEMO_AGENCY_NAME,
  agencyCity: "الدار البيضاء",
  agencyAddress: "Boulevard d'Anfa, Casablanca",
  agencyPhone: "+212522000000",
  agencyEmail: "demo@altusplace.ma",
  whatsappNumber: "212754382654",
  agencyWebsite: "https://altusplace.vercel.app",
  agencyHours: "08:00 - 20:00 (7j/7)",
  agencyLatitude: "33.5897",
  agencyLongitude: "-7.6039",
  role: "partner" as const,
  kycVerificationStatus: "verified",
};

type DemoListingRow = Omit<typeof listings.$inferInsert, "ownerId" | "status">;

/** Deterministic number of days in the past (kept < 30 for demoCleanup). */
const DAYS_AGO = [3, 6, 9, 12, 15, 18, 21, 24, 27];

/** Verified Unsplash photo (apartment interiors/buildings — all return 200). */
const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

/** Verified Wikimedia Commons thumbnail path (stable, license-safe URL). */
const WIKI = (path: string) => `https://upload.wikimedia.org/${path}`;

const CARS: DemoListingRow[] = [
  {
    title: "Dacia Duster 2023 — Location voiture à Casablanca",
    description:
      "Location journalière d'un Dacia Duster 2023 à Casablanca — SUV robuste et économique, parfait pour la ville comme pour les voyages. 62 000 km, diesel, boîte manuelle, 5 places, climatisation, Bluetooth, coffre spacieux. Livraison aéroport Mohammed V possible sur demande. / كراء يومي لداسيا داستر 2023 بالدار البيضاء — سيارة دفع رباعي متينة واقتصادية، 62,000 كم، ديزل، علبة يدوية، 5 مقاعد، مكيّفة، إمكانية توصيل من مطار محمد الخامس.",
    category: "car",
    pricePerDay: 400,
    city: "الدار البيضاء",
    lat: 33.6018,
    lng: -7.6506,
    seats: 5,
    year: 2023,
    fuelType: "ديزل",
    transmission: "يدوي",
    isFeatured: false,
    imageUrl: WIKI("wikipedia/commons/thumb/7/7b/2023_Dacia_Duster_1X7A6452.jpg/1280px-2023_Dacia_Duster_1X7A6452.jpg"),
    images: [
      WIKI("wikipedia/commons/thumb/7/7b/2023_Dacia_Duster_1X7A6452.jpg/1280px-2023_Dacia_Duster_1X7A6452.jpg"),
      WIKI("wikipedia/commons/thumb/1/15/2023_Dacia_Duster_1X7A6974.jpg/1280px-2023_Dacia_Duster_1X7A6974.jpg"),
      WIKI("wikipedia/commons/thumb/4/42/2023_Dacia_Duster_1X7A6302.jpg/1280px-2023_Dacia_Duster_1X7A6302.jpg"),
    ],
    createdAt: daysAgo(DAYS_AGO[0]),
  },
  {
    title: "Hyundai Tucson 2022 — Location SUV à Marrakech",
    description:
      "Hyundai Tucson 2022 en location à Marrakech — SUV familial confortable, 48 000 km, diesel, boîte automatique, 5 places, caméra de recul, Apple CarPlay. Idéal pour explorer la médina et les environs. / كراء هيونداي توسان 2022 بمراكش — سيارة عائلية مريحة، 48,000 كم، ديزل، علبة أوتوماتيكية، 5 مقاعد، كاميرا خلفية.",
    category: "car",
    pricePerDay: 550,
    city: "مراكش",
    lat: 31.6295,
    lng: -8.0167,
    seats: 5,
    year: 2022,
    fuelType: "ديزل",
    transmission: "أوتوماتيك",
    isFeatured: true,
    imageUrl: WIKI("wikipedia/commons/thumb/8/87/2022_Hyundai_Tucson_Hybrid.jpg/1280px-2022_Hyundai_Tucson_Hybrid.jpg"),
    images: [
      WIKI("wikipedia/commons/thumb/8/87/2022_Hyundai_Tucson_Hybrid.jpg/1280px-2022_Hyundai_Tucson_Hybrid.jpg"),
      WIKI("wikipedia/commons/thumb/0/00/2022_Hyundai_Tucson_SEL_with_HTRAC_All_Wheel_Drive.jpg/1280px-2022_Hyundai_Tucson_SEL_with_HTRAC_All_Wheel_Drive.jpg"),
      WIKI("wikipedia/commons/thumb/f/f1/Hyundai_Tucson_%28NX4%29_1X7A0424.jpg/1280px-Hyundai_Tucson_%28NX4%29_1X7A0424.jpg"),
    ],
    createdAt: daysAgo(DAYS_AGO[1]),
  },
  {
    title: "Renault Clio 2021 — Location voiture à Casablanca",
    description:
      "Renault Clio 2021, la citadine parfaite pour Casablanca — 75 000 km, essence, boîte manuelle, 5 places, climatisation, direction assistée, faible consommation. Économique et facile à garer. / كراء رينو كليو 2021 بالدار البيضاء — سيارة مدينة أنيقة واقتصادية، 75,000 كم، بنزين، علبة يدوية، 5 مقاعد، مكيّفة.",
    category: "car",
    pricePerDay: 300,
    city: "الدار البيضاء",
    lat: 33.5821,
    lng: -7.6316,
    seats: 5,
    year: 2021,
    fuelType: "بنزين",
    transmission: "يدوي",
    isFeatured: false,
    imageUrl: WIKI("wikipedia/commons/thumb/5/5a/Renault_Clio_R.S._Line_%28V%29_%E2%80%93_h_17102021.jpg/1280px-Renault_Clio_R.S._Line_%28V%29_%E2%80%93_h_17102021.jpg"),
    images: [
      WIKI("wikipedia/commons/thumb/5/5a/Renault_Clio_R.S._Line_%28V%29_%E2%80%93_h_17102021.jpg/1280px-Renault_Clio_R.S._Line_%28V%29_%E2%80%93_h_17102021.jpg"),
      WIKI("wikipedia/commons/thumb/a/a4/Renault_Clio_R.S._Line_%28V%29_%E2%80%93_f_17102021.jpg/1280px-Renault_Clio_R.S._Line_%28V%29_%E2%80%93_f_17102021.jpg"),
      WIKI("wikipedia/commons/thumb/1/1c/Renault_Clio_V_1X7A0392.jpg/1280px-Renault_Clio_V_1X7A0392.jpg"),
    ],
    createdAt: daysAgo(DAYS_AGO[2]),
  },
  {
    title: "Dacia Logan 2022 — Location voiture à Tanger",
    description:
      "Dacia Logan 2022 en location à Tanger — berline fiable et spacieuse, 88 000 km, diesel, boîte manuelle, 5 places, coffre 510 L, idéale pour les trajets vers les plages du nord. / كراء داسيا لوغان 2022 بطنجة — سيارة موثوقة وواسعة، 88,000 كم، ديزل، علبة يدوية، 5 مقاعد.",
    category: "car",
    pricePerDay: 320,
    city: "طنجة",
    lat: 35.77,
    lng: -5.7995,
    seats: 5,
    year: 2022,
    fuelType: "ديزل",
    transmission: "يدوي",
    isFeatured: false,
    imageUrl: WIKI("wikipedia/commons/thumb/5/52/2021_Dacia_Logan_III_%28front%29.jpg/1280px-2021_Dacia_Logan_III_%28front%29.jpg"),
    images: [
      WIKI("wikipedia/commons/thumb/5/52/2021_Dacia_Logan_III_%28front%29.jpg/1280px-2021_Dacia_Logan_III_%28front%29.jpg"),
      WIKI("wikipedia/commons/thumb/0/02/2021_Dacia_Logan_III_%28rear%29.jpg/1280px-2021_Dacia_Logan_III_%28rear%29.jpg"),
      WIKI("wikipedia/commons/thumb/b/b1/2021_Dacia_Logan_III_%28rear_angle_view%29.jpg/1280px-2021_Dacia_Logan_III_%28rear_angle_view%29.jpg"),
    ],
    createdAt: daysAgo(DAYS_AGO[3]),
  },
  {
    title: "Toyota Corolla 2021 — Location voiture à Tanger",
    description:
      "Toyota Corolla 2021 à Tanger — la référence de la fiabilité au Maroc, 95 000 km, essence, boîte automatique, 5 places, climatisation, écran tactile. Disponible en location journalière ou hebdomadaire. / كراء تويوتا كورولا 2021 بطنجة — سيارة موثوقة، 95,000 كم، بنزين، علبة أوتوماتيكية، 5 مقاعد.",
    category: "car",
    pricePerDay: 450,
    city: "طنجة",
    lat: 35.7595,
    lng: -5.834,
    seats: 5,
    year: 2021,
    fuelType: "بنزين",
    transmission: "أوتوماتيك",
    isFeatured: false,
    imageUrl: WIKI("wikipedia/commons/thumb/b/b3/2021_Toyota_Corolla_LE%2C_front_right%2C_07-13-2024.jpg/1280px-2021_Toyota_Corolla_LE%2C_front_right%2C_07-13-2024.jpg"),
    images: [
      WIKI("wikipedia/commons/thumb/b/b3/2021_Toyota_Corolla_LE%2C_front_right%2C_07-13-2024.jpg/1280px-2021_Toyota_Corolla_LE%2C_front_right%2C_07-13-2024.jpg"),
      WIKI("wikipedia/commons/thumb/6/60/Toyota_Corolla_Altis_Front_27082022.jpg/1280px-Toyota_Corolla_Altis_Front_27082022.jpg"),
      WIKI("wikipedia/commons/thumb/d/d7/TOYOTA_COROLLA_SEDAN_%28E210%29_China_%287%29.jpg/1280px-TOYOTA_COROLLA_SEDAN_%28E210%29_China_%287%29.jpg"),
    ],
    createdAt: daysAgo(DAYS_AGO[4]),
  },
  {
    title: "Kia Sportage 2023 — Location SUV à Marrakech",
    description:
      "Kia Sportage 2023, SUV premium en location à Marrakech — 35 000 km, diesel, boîte automatique, 5 places, toit panoramique, aides à la conduite. Le choix idéal pour un séjour élégant à Marrakech. / كراء كيا سبورتاج 2023 بمراكش — سيارة دفع رباعي فاخرة، 35,000 كم، ديزل، علبة أوتوماتيكية، سقف بانورامي.",
    category: "car",
    pricePerDay: 600,
    city: "مراكش",
    lat: 31.6211,
    lng: -8.0123,
    seats: 5,
    year: 2023,
    fuelType: "ديزل",
    transmission: "أوتوماتيك",
    isFeatured: false,
    imageUrl: WIKI("wikipedia/commons/thumb/9/97/2023_Kia_Sportage_%28NQ5%29_in_White%2C_front_left.jpg/1280px-2023_Kia_Sportage_%28NQ5%29_in_White%2C_front_left.jpg"),
    images: [
      WIKI("wikipedia/commons/thumb/9/97/2023_Kia_Sportage_%28NQ5%29_in_White%2C_front_left.jpg/1280px-2023_Kia_Sportage_%28NQ5%29_in_White%2C_front_left.jpg"),
      WIKI("wikipedia/commons/thumb/d/db/2023_Kia_Sportage_%28NQ5%29_in_White%2C_rear_right.jpg/1280px-2023_Kia_Sportage_%28NQ5%29_in_White%2C_rear_right.jpg"),
      WIKI("wikipedia/commons/thumb/5/5f/2023_Kia_Sportage_X-Line_AWD%2C_front_right%2C_12-08-2022.jpg/1280px-2023_Kia_Sportage_X-Line_AWD%2C_front_right%2C_12-08-2022.jpg"),
    ],
    createdAt: daysAgo(DAYS_AGO[5]),
  },
];

const PROPERTIES: DemoListingRow[] = [
  {
    title: "Appartement meublé 3 chambres, 105 m² — Guéliz, Marrakech",
    description:
      "Bel appartement meublé au cœur de Guéliz, Marrakech — 3 chambres, 105 m², 1er étage, salon spacieux, cuisine équipée, Wi-Fi haut débit, climatisation, parking sécurisé. À 10 min de la médina. / شقة مفروشة فاخرة بغرفة نوم 3 بغوليز مراكش — مساحة 105 م²، مطبخ مجهز، واي فاي، تكييف، موقف سيارات آمن.",
    category: "real_estate",
    pricePerDay: 500,
    pricePerMonth: 8500,
    city: "مراكش",
    lat: 31.6295,
    lng: -8.0167,
    rooms: 3,
    area: 105,
    floor: 1,
    propertyType: "شقة",
    rentalPeriod: "daily",
    amenities: "Wifi, Air conditioning, fully equipped kitchen, secure parking, smart TV, washing machine",
    isFeatured: true,
    imageUrl: IMG("photo-1522708323590-d24dbb6b0267"),
    images: [
      IMG("photo-1522708323590-d24dbb6b0267"),
      IMG("photo-1512917774080-9991f1c4c750"),
      IMG("photo-1560448204-e02f11c3d0e2"),
    ],
    createdAt: daysAgo(DAYS_AGO[6]),
  },
  {
    title: "Appartement meublé 2 chambres, 70 m² — Gauthier, Casablanca",
    description:
      "Appartement entièrement meublé dans le quartier Gauthier, Casablanca — 2 chambres, 70 m², 3e étage avec ascenseur, cuisine équipée, Wi-Fi, climatisation, proche de la corniche et du centre des affaires. / شقة مفروشة بغرفتين بحي غوتييه، الدار البيضاء — مساحة 70 م²، مطبخ مجهز، واي فاي، تكييف.",
    category: "real_estate",
    pricePerDay: 450,
    pricePerMonth: 7000,
    city: "الدار البيضاء",
    lat: 33.5849,
    lng: -7.6039,
    rooms: 2,
    area: 70,
    floor: 3,
    propertyType: "شقة",
    rentalPeriod: "daily",
    amenities: "Wifi, Air conditioning, equipped kitchen, elevator, washing machine, central location",
    isFeatured: false,
    imageUrl: IMG("photo-1600585154340-be6161a56a0c"),
    images: [
      IMG("photo-1600585154340-be6161a56a0c"),
      IMG("photo-1556909114-f6e7ad7d3136"),
      IMG("photo-1584622650111-993a426fbf0a"),
    ],
    createdAt: daysAgo(DAYS_AGO[7]),
  },
  {
    title: "Studio meublé 2 chambres, 62 m² — Hivernage, Marrakech",
    description:
      "Appartement cosy et lumineux dans le quartier Hivernage, Marrakech — 2 chambres, 62 m², 2e étage, piscine et jardin de la résidence, Wi-Fi, climatisation, cuisine équipée. Calme et à deux pas de la place Jemaa el-Fna. / شقة مريحة بحي هيفرناج مراكش — غرفتان، مساحة 62 م²، مسبح وحديقة، واي فاي، تكييف، قريبة من ساحة جامع الفنا.",
    category: "real_estate",
    pricePerDay: 400,
    pricePerMonth: 6500,
    city: "مراكش",
    lat: 31.6195,
    lng: -8.0136,
    rooms: 2,
    area: 62,
    floor: 2,
    propertyType: "شقة",
    rentalPeriod: "daily",
    amenities: "Wifi, Air conditioning, pool, garden, equipped kitchen, quiet residence",
    isFeatured: false,
    imageUrl: IMG("photo-1493809842364-78817add7ffb"),
    images: [
      IMG("photo-1493809842364-78817add7ffb"),
      IMG("photo-1523217582562-09d0def993a6"),
      IMG("photo-1502005229762-cf1b2da7c5d6"),
    ],
    createdAt: daysAgo(DAYS_AGO[8]),
  },
  {
    title: "Appartement meublé 3 chambres, 112 m² — Maârif, Casablanca",
    description:
      "Grand appartement meublé dans le quartier des Maârif, Casablanca — 3 chambres, 112 m², 5e étage avec ascenseur, double salon, cuisine équipée, 2 salles de bain, parking. À proximité des restaurants, commerces et du Twin Center. / شقة واسعة مفروشة بمعاريف الدار البيضاء — 3 غرف، مساحة 112 م²، مطبخ مجهز، حمامان، موقف سيارات.",
    category: "real_estate",
    pricePerDay: 550,
    pricePerMonth: 9000,
    city: "الدار البيضاء",
    lat: 33.5821,
    lng: -7.6316,
    rooms: 3,
    area: 112,
    floor: 5,
    propertyType: "شقة",
    rentalPeriod: "daily",
    amenities: "Wifi, Air conditioning, two bathrooms, equipped kitchen, parking, elevator, near Twin Center",
    isFeatured: false,
    imageUrl: IMG("photo-1512917774080-9991f1c4c750"),
    images: [
      IMG("photo-1512917774080-9991f1c4c750"),
      IMG("photo-1560185893-a55cbc8c57e8"),
      IMG("photo-1513694203232-719a280e022f"),
    ],
    createdAt: daysAgo(DAYS_AGO[8] - 3),
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export const DEMO_LISTING_ROWS: DemoListingRow[] = [...CARS, ...PROPERTIES];

export type SeedResult = {
  skipped: "already-seeded" | null;
  agencyId: number | null;
  cars: number;
  properties: number;
  listings: number;
  /** Demo listings whose image URLs were refreshed in place on a re-run. */
  updated: number;
};

/**
 * Re-run path: the demo agency already owns listings, so no rows are
 * inserted. Instead the verified image URLs (imageUrl + gallery) of the
 * existing demo listings are refreshed IN PLACE, matched by title (unique per
 * demo row), so re-seeding never duplicates rows and stale photos are
 * replaced with the current verified set.
 */
async function refreshDemoListingImages(db: SeedDb): Promise<number> {
  const agency = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, DEMO_AGENCY_OPENID))
    .limit(1);
  if (!agency[0]) return 0;

  // Keep the demo agency's click-to-chat number in sync on every re-run so
  // the wa.me button stays visible in demos even when the agency was seeded
  // before the whatsapp_number column existed.
  await db
    .update(users)
    .set({ whatsappNumber: AGENCY_USER.whatsappNumber })
    .where(eq(users.id, agency[0].id));

  const existing = await db
    .select({ id: listings.id, title: listings.title })
    .from(listings)
    .where(eq(listings.ownerId, agency[0].id));
  if (existing.length === 0) return 0;

  const idByTitle = new Map(existing.map((row) => [row.title, row.id]));
  let updated = 0;
  for (const row of DEMO_LISTING_ROWS) {
    const id = idByTitle.get(row.title);
    if (id === undefined) continue;
    await db.update(listings).set({ imageUrl: row.imageUrl, images: row.images }).where(eq(listings.id, id));
    updated += 1;
  }
  return updated;
}

/** Seeds the demo catalog through any drizzle db (real or test fake). */
export async function seedDemoListings(db: SeedDb): Promise<SeedResult> {
  const empty: SeedResult = { skipped: null, agencyId: null, cars: 0, properties: 0, listings: 0, updated: 0 };

  // Idempotency marker: the demo agency already owns listings → refresh the
  // verified image URLs in place instead of duplicating rows.
  const marker = await db
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(users, eq(listings.ownerId, users.id))
    .where(eq(users.openId, DEMO_AGENCY_OPENID))
    .limit(1);
  if (marker.length > 0) {
    const updated = await refreshDemoListingImages(db);
    return { ...empty, skipped: "already-seeded", updated };
  }

  // Create the demo agency user when missing (never modify existing rows).
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.openId, DEMO_AGENCY_OPENID)).limit(1);
  const agencyId = existing[0]?.id ?? null;
  let resolvedAgencyId = agencyId;
  if (!resolvedAgencyId) {
    const inserted = await db.insert(users).values(AGENCY_USER).returning({ id: users.id });
    resolvedAgencyId = inserted[0].id;
  }

  await db.insert(listings).values(
    DEMO_LISTING_ROWS.map((row) => ({ ...row, ownerId: resolvedAgencyId, status: "Published" as const })),
  );

  return {
    skipped: null,
    agencyId: resolvedAgencyId,
    cars: CARS.length,
    properties: PROPERTIES.length,
    listings: DEMO_LISTING_ROWS.length,
    updated: 0,
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
    console.log("[demo-listings] DEMO_SEED not set — skipping (demo catalog would never run in production).");
    return;
  }
  const client = postgres(loadConnectionString(), { max: 1, onnotice: () => {} });
  const db = drizzle(client);
  try {
    const result = await seedDemoListings(db);
    if (result.skipped === "already-seeded") {
      console.log(
        result.updated > 0
          ? `[demo-listings] demo agency already seeded — refreshed verified image URLs on ${result.updated} listing(s) in place (no rows added).`
          : "[demo-listings] demo agency already seeded — no demo listings to refresh.",
      );
      return;
    }
    console.log(
      `[demo-listings] seeded ${result.cars} demo cars + ${result.properties} demo apartments ` +
        `(${result.listings} listings total) under demo agency #${result.agencyId} "${DEMO_AGENCY_NAME}".`,
    );
  } finally {
    await client.end();
  }
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error("[demo-listings] failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}