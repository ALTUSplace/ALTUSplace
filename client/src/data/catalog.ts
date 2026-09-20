/**
 * ALTUSplace catalog seed — the single structured dataset for the modern
 * showcase listings (real estate + car rental).
 *
 * Every item maps 1:1 onto the `listings` table columns so it can be imported
 * straight into Supabase, replayed by server/demoSeed.ts (see CATALOG_ITEMS),
 * or consumed by frontend mock/fallback files. Arabic literals are plain UTF-8
 * (RTL-safe): the UI applies `dir="rtl"` through the shared Layout, so no
 * escape/encoding tricks are needed — only well-formed Arabic text.
 */

export interface CatalogImageCaption {
  /** Gallery image URL (must be identical to an entry in `images`). */
  url: string;
  /** What the photo actually shows — usable as alt text or by an image pipeline. */
  captionAr: string;
  /** French equivalent of the caption. */
  captionFr?: string;
}

export interface CatalogItem {
  /** Stable slug used for referencing the entry in code/docs. */
  slug: string;
  /** Optional showcase badge shown on the card (أفضل قيمة / فاخرة / 7 مقاعد / 4×4...). */
  badge?: string;
  /** Optional French badge label. */
  badgeFr?: string;
  /** Marketplace listing title (Arabic, shown to renters). */
  title: string;
  /** French listing title. */
  titleFr: string;
  /** Marketplace category — drives car vs property detection. */
  category: string;
  /** Canonical Moroccan city name (must exist in client/src/data/moroccoCities.ts). */
  city: string;
  /** Approximate city coordinates, used by the map-based search. */
  lat: number;
  lng: number;

  /** Daily rental price in MAD. */
  pricePerDay: number;
  /** Monthly rental price in MAD (real-estate stays). */
  pricePerMonth?: number;
  /** Rental rule for real-estate stays. */
  rentalPeriod?: "daily" | "monthly" | "yearly";

  /** Property-type label shown for real-estate items (شقة / مكتب / فيلا...). */
  propertyType?: string;
  /** Office layout tag (private / coworking / meeting_room / company_headquarters). */
  officeType?: string;
  /** Optional neighborhood/district badge shown on the card (e.g. المعاريف). */
  neighborhood?: string;
  /** Optional display date the listing was added (DD/MM/YYYY). */
  dateAdded?: string;

  /** Arabic description. */
  description: string;
  /** French description. */
  descriptionFr: string;
  /** Feature bullets — persisted into the `amenities` column (comma-joined). */
  features: string[];

  /** Cover image URL (also the value of the `imageUrl` column). */
  imageUrl: string;
  /** Gallery URLs (the `images` column array) — first item is the cover. */
  images: string[];
  /** Per-image descriptions, aligned with `images`. */
  imageCaptions: CatalogImageCaption[];

  /* Vehicle spec columns. */
  seats?: number;
  year?: number;
  transmission?: string;
  fuelType?: string;
  /* Real-estate spec columns. */
  rooms?: number;
  area?: number;
  floor?: number;
  /** Date the listing was added (UTC) — persisted as the `createdAt` column on seed. */
  createdAt?: Date;
}

const APARTMENT_BUILDING =
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80";
const APARTMENT_INTERIOR =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80";
const KITCHEN_MODERN =
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80";
const BATHROOM_MARBLE =
  "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80";
const SUV_EXTERIOR =
  "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=1200&q=80";
const DASHBOARD_TOUCHSCREEN =
  "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80";
const HATCHBACK_EXTERIOR =
  "https://images.unsplash.com/photo-1583267746897-2cf415887172?auto=format&fit=crop&w=1200&q=80";
const DASHBOARD_MODERN =
  "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=80";
const WRANGLER_EXTERIOR =
  "https://images.unsplash.com/photo-1534445867742-43195f401b6c?auto=format&fit=crop&w=1200&q=80";
const OFFROAD_ATLAS =
  "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=1200&q=80";
const LUXURY_SEDAN_FRONT =
  "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?auto=format&fit=crop&w=1200&q=80";
const PREMIUM_SUV_FRONT =
  "https://images.unsplash.com/photo-1556189250-72ba954cfc2b?auto=format&fit=crop&w=1200&q=80";
const LUXURY_GT_FRONT =
  "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80";
const FAMILY_VAN_SIDE =
  "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=80";
const MINIBUS_TRAVEL =
  "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80";
/* Racine furnished apartment (براسين، الدار البيضاء) — local gallery photos. */
const RACINE_SALON = "/property-photos/45856.jpg";
const RACINE_KITCHEN = "/property-photos/45857.jpg";
const RACINE_BEDROOM = "/property-photos/45858.jpg";
const RACINE_BALCONY = "/property-photos/45861.jpg";

/**
 * The catalog showcase groups (two verified apartments + the car fleet):
 *
 *   1. شقة مؤثثة 3 غرف (140 م²) — بوسيجور، الدار البيضاء (كراء يومي)
 *   2. شقة مفروشة 60 م² — براسين، الدار البيضاء (كراء شهري)
 *   3. أسطول 11 سيارة — دو مركبات 2024-2026 بأصناف متنوعة:
 *      سانديرو / كليو 5 / بيجو 208 / توسان / CLA AMG / فان راحة 7 مقاعد /
 *      أودي Q8 / رينج روفر إيفوك / مينيباص 14 مقعد / رينج روفر سبورت / كايين.
 *
 * Channels: property slugs used for real-estate detection (`isRealEstateCategory`),
 * car slugs for the fleet (`isCarCategory` → shows seats/year/transmission/fuel).
 */
export const CATALOG_ITEMS: CatalogItem[] = [
  /* 1 — Verified daily-rental apartment / الشقة المعتمدة للكراء اليومي (بوسيجور) */
  {
    slug: "beausejour-furnished-apartment-3-rooms",
    badge: "معتمدة",
    badgeFr: "Vérifié",
    title: "شقة مؤثثة 3 غرف 140 م²",
    titleFr: "Appartement meublé 3 chambres 140 m²",
    category: "شقة",
    city: "بوسيجور، الدار البيضاء",
    neighborhood: "بوسيجور",
    lat: 33.5869,
    lng: -7.6095,
    pricePerDay: 700,
    rentalPeriod: "daily",
    propertyType: "شقة",
    dateAdded: "01/09/2026",
    description:
      "شقة للكراء اليومي في بوسيجور، الدار البيضاء. اكتشفوا هذه الشقة الجميلة المعروضة للكراء اليومي، والواقعة في حي بوسيجور الراقي.",
    descriptionFr:
      "Appartement meublé en location journalière à Beauséjour, Casablanca. Découvrez ce bel appartement disponible à la location à la journée, situé dans le quartier huppé de Beauséjour.",
    features: [
      "صالة معيشة واسعة",
      "مطبخ عصري مجهز بالكامل",
      "حمام رخام فاخر",
      "تصميم داخلي عصري راقٍ",
      "واي فاي",
      "مكيف هواء",
      "كراء يومي",
    ],
    imageUrl: APARTMENT_INTERIOR,
    images: [
      APARTMENT_INTERIOR,
      KITCHEN_MODERN,
      BATHROOM_MARBLE,
      APARTMENT_BUILDING,
    ],
    imageCaptions: [
      {
        url: APARTMENT_INTERIOR,
        captionAr: "صالة معيشة واسعة بتصميم داخلي عصري راقٍ ومفروشة بالكامل",
        captionFr:
          "Grand salon au design intérieur contemporain, entièrement meublé",
      },
      {
        url: KITCHEN_MODERN,
        captionAr: "مطبخ عصري مجهز بالكامل بأجهزة حديثة وخزائن راقية",
        captionFr: "Cuisine moderne entièrement équipée",
      },
      {
        url: BATHROOM_MARBLE,
        captionAr: "حمام فاخر بتشطيبات رخامية راقية",
        captionFr: "Salle de bain de luxe avec finitions en marbre",
      },
      {
        url: APARTMENT_BUILDING,
        captionAr: "واجهة العمارة في حي بوسيجور الراقي بالدار البيضاء",
        captionFr:
          "Façade de l'immeuble dans le quartier de Beauséjour à Casablanca",
      },
    ],
    rooms: 3,
    area: 140,
    floor: 4,
    createdAt: new Date("2026-09-01T00:00:00Z"),
  },

  /* 2 — Monthly furnished apartment in Racine / شقة مفروشة ببراسين */
  {
    slug: "furnished-apartment-racine-casablanca",
    badge: "مفروشة بالكامل",
    badgeFr: "Entièrement meublé",
    title: "شقة مفروشة للإيجار في براسين (Racine) - 60 م²",
    titleFr: "Appartement meublé à louer à Racine - 60 m²",
    category: "شقة",
    city: "براسين، الدار البيضاء",
    neighborhood: "براسين",
    lat: 33.5897,
    lng: -7.623,
    pricePerDay: 9500,
    pricePerMonth: 9500,
    rentalPeriod: "monthly",
    propertyType: "شقة",
    dateAdded: "20/09/2026",
    description:
      "استئجار شقة براسين. 3 قطع رائعة مفروشة بالكامل. اكتشف هذه الشقة المميزة للإيجار في حي راقي، مع راحة تامة وخدمات متكاملة وإطلالة جميلة من الشرفة.",
    descriptionFr:
      "Location d'un appartement à Racine (Casablanca). 3 pièces magnifiques entièrement meublées. Découvrez cet appartement d'exception dans un quartier huppé, avec un confort total et une belle vue depuis le balcon.",
    features: [
      "مفروشة بالكامل",
      "تكييف مركزي وتدفئة",
      "حراسة وأمن مع نظام مراقبة",
      "باب مصفح",
      "زجاج مزدوج",
      "مرآب",
      "مسموح بدخول الحيوانات الأليفة",
      "مصعد",
      "شرفة",
      "مطبخ مجهز بالكامل",
      "حمام",
      "صالون أوروبي عصري",
    ],
    imageUrl: RACINE_SALON,
    images: [RACINE_SALON, RACINE_KITCHEN, RACINE_BEDROOM, RACINE_BALCONY],
    imageCaptions: [
      {
        url: RACINE_SALON,
        captionAr: "صالون أوروبي عصري مفروش بأناقة مع إضاءة طبيعية",
        captionFr: "Salon européen moderne entièrement meublé",
      },
      {
        url: RACINE_KITCHEN,
        captionAr: "مطبخ مجهز بالكامل بأجهزة حديثة وخزائن راقية",
        captionFr: "Cuisine entièrement équipée",
      },
      {
        url: RACINE_BEDROOM,
        captionAr: "غرفة نوم مريحة مفروشة بسرير عصري وخزانة ملابس",
        captionFr: "Chambre à coucher meublée et confortable",
      },
      {
        url: RACINE_BALCONY,
        captionAr: "شرفة بإطلالة جميلة على حي براسين الراقي",
        captionFr: "Balcon avec vue sur le quartier de Racine",
      },
    ],
    rooms: 1,
    area: 60,
    floor: 3,
    createdAt: new Date("2026-09-20T00:00:00Z"),
  },

  /* 3 — Dacia Duster 2026 / داسيا داستر */
  {
    slug: "dacia-duster-2026",
    title: "داسيا داستر 2026",
    titleFr: "Dacia Duster 2026",
    category: "سيارة رباعية / SUV",
    city: "الدار البيضاء",
    lat: 33.5731,
    lng: -7.5898,
    pricePerDay: 350,
    description:
      "داسيا داستر 2026 — السيارة الرياضية متعددة الاستعمالات الأكثر شعبية في المغرب. أداء قوي ومتانة عالية، مثالية للطرق الحضرية والرحلات خارج المدينة على حد سواء.",
    descriptionFr:
      "Dacia Duster 2026 — le SUV préféré au Maroc. Performances robustes et fiabilité, idéal aussi bien en ville que pour les escapades hors des villes.",
    features: [
      "تكييف هواء",
      "شاشة لمس",
      "بلوتوث ونظام صوتي",
      "حساسات وقوف",
      "توصيل للمطار",
      "تأمين شامل",
    ],
    imageUrl: SUV_EXTERIOR,
    images: [SUV_EXTERIOR, DASHBOARD_TOUCHSCREEN],
    imageCaptions: [
      {
        url: SUV_EXTERIOR,
        captionAr: "الواجهة الخارجية لسيارة داسيا داستر الفئة الرباعية الدفع",
        captionFr: "Extérieur du Dacia Duster (SUV)",
      },
      {
        url: DASHBOARD_TOUCHSCREEN,
        captionAr: "لوحة القيادة الداخلية بشاشة لمس ومقاعد حديثة",
        captionFr: "Tableau de bord intérieur avec écran tactile",
      },
    ],
    seats: 5,
    year: 2026,
    transmission: "يدوي / أوتوماتيك",
    fuelType: "بنزين / ديزل",
  },
  {
    slug: "renault-clio-2026",
    title: "رونو كليو 5 2026",
    titleFr: "Renault Clio 5 2026",
    badge: "أفضل قيمة",
    badgeFr: "Meilleure valeur",
    category: "سيارة اقتصادية / City",
    city: "مراكش",
    lat: 31.6295,
    lng: -7.9811,
    pricePerDay: 300,
    description:
      "رونو كليو 5 2026 — الجيل الخامس من السيارة الحضرية الأكثر طلبًا في المغرب. اقتصادية في الاستهلاك، شاشة لمس ونظام صوتي عالي، مثالية للتنقل اليومي والمطارات. متوفرة بالفئة الأوتوماتيك الجديدة.",
    descriptionFr:
      "Renault Clio 5 2026 — la 5e génération de la citadine la plus demandée au Maroc. Économique, écran tactile, système audio. Parfaite au quotidien et pour les transferts aéroport.",
    features: [
      "اقتصادية في الوقود",
      "شاشة لمس",
      "بلوتوث ونظام صوتي",
      "تكييف هواء",
      "حساسات وقوف",
      "توصيل للمطار",
      "تأمين شامل",
    ],
    imageUrl: SUV_EXTERIOR,
    images: [SUV_EXTERIOR, DASHBOARD_MODERN],
    imageCaptions: [
      {
        url: SUV_EXTERIOR,
        captionAr: "الواجهة الخارجية لرونو كليو الفئة الحضرية",
        captionFr: "Extérieur de la Renault Clio (citadine)",
      },
      {
        url: DASHBOARD_MODERN,
        captionAr: "لوحة قيادة بشاشة لمس وتجهيزات داخلية متطورة",
        captionFr: "Tableau de bord avec écran tactile",
      },
    ],
    seats: 5,
    year: 2026,
    transmission: "يدوي / أوتوماتيك",
    fuelType: "بنزين",
  },

  /* 5 — Peugeot 208 2024 / بيجو 208 */
  {
    slug: "peugeot-208-2024",
    title: "بيجو 208 2024",
    titleFr: "Peugeot 208 2024",
    badge: "أفضل قيمة",
    badgeFr: "Meilleure valeur",
    category: "سيارة اقتصادية / City",
    city: "الدار البيضاء",
    lat: 33.5731,
    lng: -7.5898,
    pricePerDay: 320,
    description:
      "بيجو 208 2024 — التصميم الفرنسي الأنيق بتقنيات حديثة. مقصورة عصرية بتصميم i-Cockpit، شاشة لمس واقتصادية في الوقود. مثالية للمدينة والضواحي مع أنظمة مساعدة للقيادة.",
    descriptionFr:
      "Peugeot 208 2024 — le design français élégant avec technologies modernes. Habitacle i-Cockpit, écran tactile, économique. Idéale en ville et en banlieue.",
    features: [
      "تصميم i-Cockpit",
      "شاشة لمس",
      "اقتصادية في الوقود",
      "تكييف هواء",
      "بلوتوث",
      "توصيل للمطار",
      "تأمين شامل",
    ],
    imageUrl: HATCHBACK_EXTERIOR,
    images: [HATCHBACK_EXTERIOR, DASHBOARD_MODERN],
    imageCaptions: [
      {
        url: HATCHBACK_EXTERIOR,
        captionAr: "الواجهة الخارجية لبيجو 208 بتصميم فرنسي أنيق",
        captionFr: "Extérieur de la Peugeot 208",
      },
      {
        url: DASHBOARD_MODERN,
        captionAr: "لوحة قيادة i-Cockpit مع شاشة لمس عصرية",
        captionFr: "Tableau de bord i-Cockpit avec écran tactile",
      },
    ],
    seats: 5,
    year: 2024,
    transmission: "أوتوماتيك",
    fuelType: "بنزين",
  },

  /* 6 — Hyundai Tucson 2022 / هيونداي توسان SUV */
  {
    slug: "hyundai-tucson-2022",
    title: "هيونداي توسان 2022",
    titleFr: "Hyundai Tucson 2022",
    badge: "4×4 SUV",
    badgeFr: "4x4 SUV",
    category: "سيارة رباعية / SUV",
    city: "الرباط",
    lat: 34.0209,
    lng: -6.8416,
    pricePerDay: 700,
    description:
      "هيونداي توسان 2022 — السيارة الرياضية متعددة الاستعمالات بسعة عائلية واسعة. محرك اقتصادي، أنظمة أمان حديثة وتصميم هندسي أنيق. مثالية للرحلات العائلية والطرق الجبلية.",
    descriptionFr:
      "Hyundai Tucson 2022 — SUV familial spacieux. Moteur économique, systèmes de sécurité modernes et design anguleux. Parfait pour les escapades en famille.",
    features: [
      "دفع رباعي / 4x4",
      "تكييف هواء",
      "شاشة لمس",
      "أنظمة أمان حديثة",
      "بلوتوث",
      "توصيل للمطار",
      "تأمين شامل",
    ],
    imageUrl: OFFROAD_ATLAS,
    images: [OFFROAD_ATLAS, DASHBOARD_TOUCHSCREEN],
    imageCaptions: [
      {
        url: OFFROAD_ATLAS,
        captionAr: "هيونداي توسان على الطرق الجبلية بفئة الدفع الرباعي",
        captionFr: "Hyundai Tucson sur routes de montagne (4x4)",
      },
      {
        url: DASHBOARD_TOUCHSCREEN,
        captionAr: "لوحة قيادة بشاشة لمس ونظام معلومات حديث",
        captionFr: "Tableau de bord avec écran tactile",
      },
    ],
    seats: 5,
    year: 2022,
    transmission: "أوتوماتيك",
    fuelType: "بنزين",
  },

  /* 7 — Mercedes CLA AMG 2023 / مرسيدس CLA */
  {
    slug: "mercedes-cla-amg-2023",
    title: "مرسيدس CLA AMG 2023",
    titleFr: "Mercedes CLA AMG 2023",
    badge: "فاخرة",
    badgeFr: "Premium",
    category: "سيارة فاخرة / Coupé",
    city: "الدار البيضاء",
    lat: 33.5731,
    lng: -7.5898,
    pricePerDay: 1200,
    description:
      "مرسيدس CLA AMG 2023 — الفخامة الرياضية بتصميم كوبيه أنيق وأداء استثنائي لقى 300 حصان. مقصورة مكسوة بالجلد مع تقنيات MBUX. مثالية للمناسبات الخاصة والقيادة الفاخرة.",
    descriptionFr:
      "Mercedes CLA AMG 2023 — le luxe sportif en coupé élégant : 300 ch, intérieur cuir, technologie MBUX. Parfaite pour les occasions spéciales.",
    features: [
      "300 حصان",
      "تصميم كوبيه",
      "مقصورة جلد فاخرة",
      "شاشة MBUX مزدوجة",
      "تكييف",
      "توصيل للمطار",
      "تأمين شامل",
    ],
    imageUrl: OFFROAD_ATLAS,
    images: [OFFROAD_ATLAS, DASHBOARD_TOUCHSCREEN],
    imageCaptions: [
      {
        url: OFFROAD_ATLAS,
        captionAr: "الواجهة الأمامية لمرسيدس CLA AMG الفاخرة",
        captionFr: "Avant de la Mercedes CLA AMG",
      },
      {
        url: DASHBOARD_TOUCHSCREEN,
        captionAr: "شاشة MBUX مزدوجة ومقصورة فاخرة",
        captionFr: "Écrans MBUX et habitacle premium",
      },
    ],
    seats: 5,
    year: 2023,
    transmission: "أوتوماتيك",
    fuelType: "بنزين",
  },

  /* 5 — Jeep Wrangler 2025 / جيب رانجلر */
  {
    slug: "jeep-wrangler-2025",
    title: "جيب رانجلر 2025",
    titleFr: "Jeep Wrangler 2025",
    category: "سيارة رباعية / SUV",
    city: "ورزازات",
    lat: 30.9189,
    lng: -6.8934,
    pricePerDay: 900,
    description:
      "جيب رانجلر 2025 — مركبة المغامرات الأوف-رود المصممة للمناظر المغربية: جبال الأطلس والصحراء. قدرة دفع رباعي استثنائية مع راحة حديثة، مثالية للرحلات الاستكشافية نحو ورزازات وأيت بن حدو والكثبان الرملية.",
    descriptionFr:
      "Jeep Wrangler 2025 — le 4x4 d'aventure taillé pour les paysages marocains : montagnes de l'Atlas et désert. Capacités hors-piste exceptionnelles, idéale pour les expéditions vers Ouarzazate, Aït Ben Haddou et les dunes.",
    features: [
      "دفع رباعي",
      "تكييف هواء",
      "شاشة لمس",
      "بلوتوث",
      "توصيل للمطار",
      "تأمين شامل",
    ],
    imageUrl: WRANGLER_EXTERIOR,
    images: [WRANGLER_EXTERIOR, OFFROAD_ATLAS],
    imageCaptions: [
      {
        url: WRANGLER_EXTERIOR,
        captionAr: "الواجهة الخارجية لجيب رانجلر بفئة الدفع الرباعي",
        captionFr: "Extérieur du Jeep Wrangler 4x4",
      },
      {
        url: OFFROAD_ATLAS,
        captionAr: "لقطة أوف-روود لسيارة رباعية وسط طبيعة جبال الأطلس",
        captionFr: "Coup d'œil hors-piste au cœur des paysages de l'Atlas",
      },
    ],
    seats: 5,
    year: 2025,
    transmission: "أوتوماتيك",
    fuelType: "بنزين",
  },
];

/** Cover URLs for quick lookups (slug → imageUrl). */
export const CATALOG_COVER_BY_SLUG: Record<string, string> = Object.fromEntries(
  CATALOG_ITEMS.map(item => [item.slug, item.imageUrl])
);
