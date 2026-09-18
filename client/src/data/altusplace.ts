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
];
