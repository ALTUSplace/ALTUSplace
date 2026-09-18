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
}

const APARTMENT_BUILDING =
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80";
const APARTMENT_INTERIOR =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80";
const OFFICE_OPEN_SPACE =
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80";
const OFFICE_MEETING_ROOM =
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80";
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

/**
 * The five catalog groups (7 seed-ready rows because apartments and offices
 * ship two city variants each):
 *
 *   1. شقة حديثة (2 غرف) — الدار البيضاء + تطوان
 *   2. مكتب تجاري عصري — الرباط + الدار البيضاء
 *   3. داسيا داستر 2026 — الدار البيضاء
 *   4. رونو كليو 2026 — مراكش
 *   5. جيب رانجلر 2025 — ورزازات
 */
export const CATALOG_ITEMS: CatalogItem[] = [
  /* 1 — Modern apartment / شقة حديثة */
  {
    slug: "modern-apartment-casablanca",
    title: "شقة حديثة مطلة على شارع الدار البيضاء",
    titleFr: "Appartement moderne à Casablanca",
    category: "شقة",
    city: "الدار البيضاء",
    lat: 33.5731,
    lng: -7.5898,
    pricePerDay: 400,
    pricePerMonth: 9000,
    rentalPeriod: "monthly",
    propertyType: "شقة",
    description:
      "شقة عصرية فسيحة تضم غرفتي نوم وصالة معيشة واسعة ومطبخًا حديثًا مجهزًا بالكامل. تقع في منطقة راقية بالدار البيضاء على مقربة من المرافق والخدمات، ومثالية للعائلات والكراء الشهري.",
    descriptionFr:
      "Appartement moderne et spacieux avec 2 chambres, grand salon et cuisine équipée. Idéalement situé dans un quartier résidentiel de Casablanca, idéal pour les familles et la location mensuelle.",
    features: ["غرفتا نوم", "صالة معيشة واسعة", "مطبخ عصري مجهز", "واي فاي", "تلفاز ذكي", "مكيف هواء", "موقف خاص"],
    imageUrl: APARTMENT_BUILDING,
    images: [APARTMENT_BUILDING, APARTMENT_INTERIOR],
    imageCaptions: [
      {
        url: APARTMENT_BUILDING,
        captionAr: "واجهة عمارة سكنية مغربية عصرية بألوان دافئة ونوافذ كبيرة",
        captionFr: "Façade d'un immeuble résidentiel marocain moderne",
      },
      {
        url: APARTMENT_INTERIOR,
        captionAr: "غرفة معيشة حديثة مفروشة بأريكة مريحة وإضاءة طبيعية",
        captionFr: "Salon moderne entièrement meublé",
      },
    ],
    rooms: 2,
    area: 85,
    floor: 2,
  },
  {
    slug: "modern-apartment-tetouan",
    title: "شقة حديثة قرب وسط تطوان",
    titleFr: "Appartement moderne à Tétouan",
    category: "شقة",
    city: "تطوان",
    lat: 35.5889,
    lng: -5.3626,
    pricePerDay: 350,
    pricePerMonth: 7500,
    rentalPeriod: "monthly",
    propertyType: "شقة",
    description:
      "شقة عصرية قريبة من وسط تطوان، تضم غرفتي نوم وصالة واسعة ومطبخًا حديثًا. هادئة ومؤثثة بالكامل، مثالية للعائلات والطلاب وللكراء الشهري قرب البحر.",
    descriptionFr:
      "Appartement moderne près du centre de Tétouan : 2 chambres, grand salon et cuisine moderne. Calme et entièrement meublé, idéal pour familles, étudiants et location mensuelle.",
    features: ["غرفتا نوم", "صالة معيشة واسعة", "مطبخ عصري مجهز", "واي فاي", "تلفاز ذكي", "مكيف هواء"],
    imageUrl: APARTMENT_BUILDING,
    images: [APARTMENT_BUILDING, APARTMENT_INTERIOR],
    imageCaptions: [
      {
        url: APARTMENT_BUILDING,
        captionAr: "واجهة عمارة سكنية مغربية عصرية بألوان دافئة ونوافذ كبيرة",
        captionFr: "Façade d'un immeuble résidentiel marocain moderne",
      },
      {
        url: APARTMENT_INTERIOR,
        captionAr: "غرفة معيشة حديثة مفروشة بأريكة مريحة وإضاءة طبيعية",
        captionFr: "Salon moderne entièrement meublé",
      },
    ],
    rooms: 2,
    area: 80,
    floor: 3,
  },

  /* 2 — Modern office / مكتب تجاري */
  {
    slug: "modern-office-rabat",
    title: "مكتب تجاري عصري بجدران زجاجية في الرباط",
    titleFr: "Bureau moderne avec parois vitrées à Rabat",
    category: "مكتب",
    city: "الرباط",
    lat: 34.0209,
    lng: -6.8416,
    pricePerDay: 450,
    pricePerMonth: 9500,
    rentalPeriod: "monthly",
    propertyType: "مكتب",
    officeType: "coworking",
    description:
      "مكتب تجاري عصري في الرباط بتصميم مفتوح وجدران زجاجية، يشمل قاعة اجتماعات ومساحات عمل مهنية مجهزة بالكامل بمكاتب حديثة وإنترنت فايبر. خيار مثالي للشركات الناشئة والفرق المهنية.",
    descriptionFr:
      "Bureau moderne à Rabat en open space avec parois vitrées : salle de réunion, postes de travail équipés, fibre. Idéal pour startups et équipes professionnelles.",
    features: ["قاعة اجتماعات", "فضاء عمل مفتوح", "جدران زجاجية", "مكاتب مهنية حديثة", "استقبال", "فايبر", "مكيف هواء", "موقف سيارات"],
    imageUrl: OFFICE_OPEN_SPACE,
    images: [OFFICE_OPEN_SPACE, OFFICE_MEETING_ROOM],
    imageCaptions: [
      {
        url: OFFICE_OPEN_SPACE,
        captionAr: "فضاء عمل مفتوح بجدران زجاجية ومكاتب عمل عصرية",
        captionFr: "Open space vitré avec postes de travail modernes",
      },
      {
        url: OFFICE_MEETING_ROOM,
        captionAr: "قاعة اجتماعات زجاجية مجهزة بكراسي ومكاتب مهنية",
        captionFr: "Salle de réunion vitrée équipée",
      },
    ],
    rooms: 2,
    area: 120,
    floor: 4,
  },
  {
    slug: "modern-office-casablanca",
    title: "مكتب تجاري عصري في قلب الدار البيضاء",
    titleFr: "Bureau moderne en plein centre de Casablanca",
    category: "مكتب",
    city: "الدار البيضاء",
    lat: 33.5897,
    lng: -7.6036,
    pricePerDay: 500,
    pricePerMonth: 11000,
    rentalPeriod: "monthly",
    propertyType: "مكتب",
    officeType: "coworking",
    description:
      "مكتب تجاري راقٍ في وسط الدار البيضاء مصمم بأسلوب مفتوح وجدران زجاجية، يضم قاعة اجتماعات ومساحة عمل مشتركة بمكاتب مهنية عصرية. موقع استراتيجي قرب المؤسسات والأعمال.",
    descriptionFr:
      "Bureau haut standing au centre de Casablanca : agencement open space et vitré, salle de réunion et espace partagé avec mobilier professionnel. Emplacement stratégique.",
    features: ["قاعة اجتماعات", "فضاء عمل مفتوح", "جدران زجاجية", "مكاتب مهنية حديثة", "استقبال", "فايبر", "مكيف هواء", "موقف سيارات"],
    imageUrl: OFFICE_OPEN_SPACE,
    images: [OFFICE_OPEN_SPACE, OFFICE_MEETING_ROOM],
    imageCaptions: [
      {
        url: OFFICE_OPEN_SPACE,
        captionAr: "فضاء عمل مفتوح بجدران زجاجية ومكاتب عمل عصرية",
        captionFr: "Open space vitré avec postes de travail modernes",
      },
      {
        url: OFFICE_MEETING_ROOM,
        captionAr: "قاعة اجتماعات زجاجية مجهزة بكراسي ومكاتب مهنية",
        captionFr: "Salle de réunion vitrée équipée",
      },
    ],
    rooms: 2,
    area: 140,
    floor: 5,
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
    features: ["تكييف هواء", "شاشة لمس", "بلوتوث ونظام صوتي", "حساسات وقوف", "توصيل للمطار", "تأمين شامل"],
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
    title: "رونو كليو 2026",
    titleFr: "Renault Clio 2026",
    category: "سيارة اقتصادية / City",
    city: "مراكش",
    lat: 31.6295,
    lng: -7.9811,
    pricePerDay: 300,
    description:
      "رونو كليو 2026 — السيارة الحضرية الأكثر طلبًا في المغرب. اقتصادية في الاستهلاك وسهلة القيادة في المدن، ومجهزة بشاشة لمس وأنظمة مساعدة حديثة. مثالية للتنقل اليومي والمطارات.",
    descriptionFr:
      "Renault Clio 2026 — la citadine préférée au Maroc. Économique, agile en ville, dotée d'un écran tactile et d'aides à la conduite. Parfaite au quotidien et pour les transferts aéroport.",
    features: ["اقتصادية في الوقود", "شاشة لمس", "بلوتوث ونظام صوتي", "تكييف هواء", "حساسات وقوف", "توصيل للمطار", "تأمين شامل"],
    imageUrl: HATCHBACK_EXTERIOR,
    images: [HATCHBACK_EXTERIOR, DASHBOARD_MODERN],
    imageCaptions: [
      {
        url: HATCHBACK_EXTERIOR,
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
    features: ["دفع رباعي", "تكييف هواء", "شاشة لمس", "بلوتوث", "توصيل للمطار", "تأمين شامل"],
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
  CATALOG_ITEMS.map((item) => [item.slug, item.imageUrl]),
);