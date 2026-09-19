export interface PartnerProvider {
  id: string;
  name: string;
  type: 'car_rental';
  city: string;
  isExcellence?: boolean;
  phone: string;
  email: string;
  logo: string;
  verified: boolean;
  status?: 'active' | 'pending' | 'rejected';
}

export interface ListingItem {
  id: string;
  providerId: string;
  providerName: string;
  type: 'car' | 'property' | 'office';
  title: string;
  titleFr?: string;
  category: string; // e.g., "SUV / سيارة رباعية", "سيارة اقتصادية / City"
  city: string;
  pricePerUnit: number; // per day for cars, per night/month for properties
  unitLabel: string; // "درهم / يوم" or "درهم / ليلة"
  image: string;
  images: string[];
  rating?: number;
  reviewCount?: number;
  features: string[];
  description: string;
  descriptionFr?: string;
  officeType?: 'private' | 'coworking' | 'meeting_room' | 'company_headquarters';
  amenities?: ('fiber' | 'air_conditioning' | 'reception' | 'parking' | 'security')[];
  rentalTerms?: ('daily' | 'monthly' | 'yearly')[];
  specs: {
    transmission?: string;
    seats?: string;
    fuel?: string;
    rooms?: string;
    area?: string;
    bathrooms?: string;
    year?: number;
  };
}

export const PARTNERS: PartnerProvider[] = [
  {
    id: 'p1',
    name: 'أغادير كار برستيج (وكالة سيارات)',
    type: 'car_rental',
    city: 'أغادير',
    phone: '',
    email: 'ALTUSplace@gmail.com',
    logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'active',
  },
  {
    id: 'p3',
    name: 'الدار البيضاء الدولية للسيارات',
    type: 'car_rental',
    city: 'الدار البيضاء',
    phone: '',
    email: 'ALTUSplace@gmail.com',
    logo: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'pending',
  },
  {
    id: 'p4',
    name: 'ALTUSplace — كتالوج العرض 2026',
    type: 'car_rental',
    city: 'الدار البيضاء',
    phone: '',
    email: 'ALTUSplace@gmail.com',
    logo: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'active',
  },
];

export const LISTINGS: ListingItem[] = [
  {
    id: 'l1',
    providerId: 'p1',
    providerName: 'أغادير كار برستيج',
    type: 'car',
    title: 'رينو كليو',
    titleFr: 'Renault Clio',
    category: 'سيارة رباعية / SUV',
    city: 'أغادير',
    pricePerUnit: 300,
    unitLabel: 'درهم / يوم',
    image: '/car-photos/car1.webp',
    images: [
      '/car-photos/car1.webp',
      '/car-photos/car2.webp'
    ],
    features: ['تكييف رقمي', 'تحكم في المقود', 'توصيل مجاني للمطار', 'ناقل مانوال', 'شاشة تعمل باللمس'],
    description: 'سيارة دفع رباعي اقتصادية وقوية، ممتازة للطرق الوعرة والمدن المغربية. تشمل التأمين الشامل والصيانة الدورية.',
    specs: { transmission: 'يدوي (Manual)', seats: '5 مقاعد', fuel: 'ديزل (Diesel)' }
  },
  {
    id: 'l3',
    providerId: 'p3',
    providerName: 'الدار البيضاء الدولية للسيارات',
    type: 'car',
    title: 'رينو كليو (Renault Clio)',
    titleFr: 'Renault Clio — citadine économique',
    category: 'سيارة اقتصادية / City',
    city: 'الدار البيضاء',
    pricePerUnit: 250,
    unitLabel: 'درهم / يوم',
    image: '/car-photos/car3.webp',
    images: [
      '/car-photos/car3.webp',
      '/car-photos/car4.webp'
    ],
    features: ['اقتصادية جداً في الوقود', 'حساسات وقوف', 'بلوتوث ونظام صوتي متطور', 'تكييف هواء'],
    description: 'السيارة الأكثر طلباً للتنقل الحضري في الدار البيضاء ومحطة قطار محمد الخامس والمطارات.',
    specs: { transmission: 'أوتوماتيك', seats: '5 مقاعد', fuel: 'بنزين / ديزل' }
  },
  {
    id: 'l4',
    providerId: 'p4',
    providerName: 'ALTUSplace — كتالوج العرض 2026',
    type: 'property',
    title: 'شقة مؤثثة 3 غرف 140 م²',
    titleFr: 'Appartement meublé 3 chambres 140 m² — Beauséjour, Casablanca',
    category: 'شقة',
    city: 'بوسيجور، الدار البيضاء',
    pricePerUnit: 700,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80'
    ],
    features: [
      'صالة معيشة واسعة',
      'مطبخ عصري مجهز بالكامل',
      'حمام رخام فاخر',
      'تصميم داخلي عصري راقٍ',
      'واي فاي',
      'مكيف هواء',
      'كراء يومي'
    ],
    description: 'شقة للكراء اليومي في بوسيجور، الدار البيضاء. اكتشفوا هذه الشقة الجميلة المعروضة للكراء اليومي، والواقعة في حي بوسيجور الراقي.',
    rentalTerms: ['daily'],
    specs: { rooms: '3 غرف', area: '140 م²', bathrooms: '1 حمام رخام فاخر' }
  },
  {
    id: 'l6',
    providerId: 'p4',
    providerName: 'ALTUSplace — كتالوج العرض 2026',
    type: 'car',
    title: 'داسيا داستر 2026',
    titleFr: 'Dacia Duster 2026',
    category: 'سيارة رباعية / SUV',
    city: 'الدار البيضاء',
    pricePerUnit: 350,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['تكييف هواء', 'شاشة لمس', 'بلوتوث ونظام صوتي', 'حساسات وقوف', 'توصيل للمطار', 'تأمين شامل'],
    description: 'داسيا داستر 2026 — السيارة الرياضية متعددة الاستعمالات الأكثر شعبية في المغرب. أداء قوي ومتانة عالية للمدن والرحلات.',
    specs: { transmission: 'يدوي / أوتوماتيك', seats: '5 مقاعد', fuel: 'بنزين / ديزل', year: 2026 }
  },
  {
    id: 'l7',
    providerId: 'p4',
    providerName: 'ALTUSplace — كتالوج العرض 2026',
    type: 'car',
    title: 'رونو كليو 2026',
    titleFr: 'Renault Clio 2026',
    category: 'سيارة اقتصادية / City',
    city: 'مراكش',
    pricePerUnit: 300,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1583267746897-2cf415887172?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1583267746897-2cf415887172?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['اقتصادية في الوقود', 'شاشة لمس', 'بلوتوث ونظام صوتي', 'تكييف هواء', 'حساسات وقوف', 'توصيل للمطار', 'تأمين شامل'],
    description: 'رونو كليو 2026 — السيارة الحضرية الأكثر طلبًا في المغرب. اقتصادية وسهلة القيادة مع شاشة لمس وأنظمة مساعدة حديثة.',
    specs: { transmission: 'يدوي / أوتوماتيك', seats: '5 مقاعد', fuel: 'بنزين', year: 2026 }
  },
  {
    id: 'l8',
    providerId: 'p4',
    providerName: 'ALTUSplace — كتالوج العرض 2026',
    type: 'car',
    title: 'جيب رانجلر 2025',
    titleFr: 'Jeep Wrangler 2025',
    category: 'سيارة رباعية / SUV',
    city: 'ورزازات',
    pricePerUnit: 900,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1534445867742-43195f401b6c?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1534445867742-43195f401b6c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['دفع رباعي', 'تكييف هواء', 'شاشة لمس', 'بلوتوث', 'توصيل للمطار', 'تأمين شامل'],
    description: 'جيب رانجلر 2025 — مركبة المغامرات الأوف-رود المصممة للمناظر المغربية: جبال الأطلس والصحراء.',
    specs: { transmission: 'أوتوماتيك', seats: '5 مقاعد', fuel: 'بنزين', year: 2025 }
  },
];
