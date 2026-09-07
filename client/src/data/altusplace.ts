export interface PartnerProvider {
  id: string;
  name: string;
  type: 'car_rental' | 'real_estate';
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
  category: string; // e.g., "SUV / سيارة رباعية", "شقة فاخرة / Apartment", "فيلا مجهزة"
  city: string;
  pricePerUnit: number; // per day for cars, per night/month for properties
  unitLabel: string; // "درهم / يوم" or "درهم / ليلة"
  image: string;
  images: string[];
  features: string[];
  description: string;
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
  };
}

export const PARTNERS: PartnerProvider[] = [
  {
    id: 'p1',
    name: 'أغادير كار برستيج (وكالة سيارات)',
    type: 'car_rental',
    city: 'أغادير',
    phone: '',
    email: 'b2rentt@gmail.com',
    logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'active',
  },
  {
    id: 'p2',
    name: 'مراكش القصر العقاري (وكالة عقارية)',
    type: 'real_estate',
    city: 'مراكش',
    phone: '',
    email: 'b2rentt@gmail.com',
    logo: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'active',
  },
  {
    id: 'p3',
    name: 'الدار البيضاء الدولية للسيارات',
    type: 'car_rental',
    city: 'الدار البيضاء',
    phone: '',
    email: 'b2rentt@gmail.com',
    logo: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'pending',
  },
  {
    id: 'p4',
    name: 'طنجة بيتش للعقارات الفاخرة',
    type: 'real_estate',
    city: 'طنجة',
    phone: '',
    email: 'b2rentt@gmail.com',
    logo: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=200&q=80',
    verified: true,
    status: 'rejected',
  },
];

export const LISTINGS: ListingItem[] = [
  {
    id: 'l1',
    providerId: 'p1',
    providerName: 'أغادير كار برستيج',
    type: 'car',
    title: 'داسيا داستر الجديدة (Dacia Duster)',
    category: 'سيارة رباعية / SUV',
    city: 'أغادير',
    pricePerUnit: 450,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['تكييف رقمي', 'تحكم في المقود', 'توصيل مجاني للمطار', 'ناقل مانوال', 'شاشة تعمل باللمس'],
    description: 'سيارة دفع رباعي اقتصادية وقوية، ممتازة للطرق الوعرة والمدن المغربية. تشمل التأمين الشامل والصيانة الدورية.',
    specs: { transmission: 'يدوي (Manual)', seats: '5 مقاعد', fuel: 'ديزل (Diesel)' }
  },
  {
    id: 'l2',
    providerId: 'p2',
    providerName: 'مراكش القصر العقاري',
    type: 'property',
    title: 'شقة عصرية فاخرة مع مسبح في جليز',
    category: 'شقة مفروشة / Apartment',
    city: 'مراكش',
    pricePerUnit: 950,
    unitLabel: 'درهم / ليلة',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['مسبح مشترك', 'واي فاي سريع', 'أمن 24/7', 'موقف سيارات خاص', 'شرفة بإطلالة بانورامية'],
    description: 'شقة مفروشة بتصميم راقٍ في قلب حي جليز الراقي بمراكش. قريبة من جميع المطاعم والمقاهي والأماكن السياحية.',
    specs: { rooms: 'غرفتا نوم', area: '110 متر مربع', bathrooms: '2 حمام' }
  },
  {
    id: 'l3',
    providerId: 'p3',
    providerName: 'الدار البيضاء الدولية للسيارات',
    type: 'car',
    title: 'رينو كليو 5 (Renault Clio V)',
    category: 'سيارة اقتصادية / City',
    city: 'الدار البيضاء',
    pricePerUnit: 320,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['اقتصادية جداً في الوقود', 'حساسات وقوف', 'بلوتوث ونظام صوتي متطور', 'تكييف هواء'],
    description: 'السيارة الأكثر طلباً للتنقل الحضري في الدار البيضاء ومحطة قطار محمد الخامس والمطارات.',
    specs: { transmission: 'أوتوماتيك', seats: '5 مقاعد', fuel: 'بنزين / ديزل' }
  },
  {
    id: 'l5',
    providerId: 'p2',
    providerName: 'مراكش القصر العقاري - Business Spaces',
    type: 'office',
    title: 'مكتب خاص راقٍ في مركز مراكش',
    category: 'مكتب خاص / Bureau privé',
    city: 'مراكش',
    pricePerUnit: 1800,
    unitLabel: 'درهم / شهر',
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80'],
    features: ['إنترنت فايبر أوبتيك', 'مكيف هواء', 'قاعة استقبال', 'مرآب سيارات'],
    description: 'مكتب خاص مجهز للشركات الناشئة والمهنيين، بموقع مركزي وخدمات استقبال احترافية.',
    officeType: 'private',
    amenities: ['fiber', 'air_conditioning', 'reception', 'parking'],
    rentalTerms: ['daily', 'monthly', 'yearly'],
    specs: { area: '28 متر مربع' }
  },
  {
    id: 'l6',
    providerId: 'p3',
    providerName: 'الدار البيضاء Business Hub',
    type: 'office',
    title: 'مساحة عمل مشتركة للشركات في كازا',
    category: 'Coworking / مساحة مشتركة',
    city: 'الدار البيضاء',
    pricePerUnit: 120,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80'],
    features: ['إنترنت فايبر أوبتيك', 'مكيف هواء', 'قاعة استقبال'],
    description: 'Coworking مرن لرواد الأعمال والفرق الصغيرة مع إنترنت سريع ومرافق مشتركة.',
    officeType: 'coworking',
    amenities: ['fiber', 'air_conditioning', 'reception'],
    rentalTerms: ['daily', 'monthly'],
    specs: { area: '120 متر مربع' }
  },
  {
    id: 'l7',
    providerId: 'p2',
    providerName: 'مراكش القصر العقاري - Business Spaces',
    type: 'office',
    title: 'قاعة اجتماعات مجهزة في جليز',
    category: 'قاعة اجتماعات / Salle de réunion',
    city: 'مراكش',
    pricePerUnit: 650,
    unitLabel: 'درهم / يوم',
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80'],
    features: ['إنترنت فايبر أوبتيك', 'مكيف هواء', 'قاعة استقبال', 'حراسة'],
    description: 'قاعة اجتماعات مهنية لاستقبال العملاء وتنظيم الاجتماعات والورشات في موقع مركزي.',
    officeType: 'meeting_room',
    amenities: ['fiber', 'air_conditioning', 'reception', 'security'],
    rentalTerms: ['daily', 'monthly'],
    specs: { area: '42 متر مربع' }
  },
  {
    id: 'l8',
    providerId: 'p3',
    providerName: 'الدار البيضاء Business Hub',
    type: 'office',
    title: 'مقر شركة جاهز في المعاريف',
    category: 'مقر شركة / Siège d’entreprise',
    city: 'الدار البيضاء',
    pricePerUnit: 9500,
    unitLabel: 'درهم / شهر',
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80'],
    features: ['إنترنت فايبر أوبتيك', 'مكيف هواء', 'مرآب سيارات', 'حراسة'],
    description: 'مقر مهني قابل للتخصيص للشركات مع استقبال وحراسة ومرافق مناسبة للتسجيل الإداري.',
    officeType: 'company_headquarters',
    amenities: ['fiber', 'air_conditioning', 'parking', 'security'],
    rentalTerms: ['monthly', 'yearly'],
    specs: { area: '180 متر مربع', rooms: '6 مكاتب' }
  },
  {
    id: 'l4',
    providerId: 'p4',
    providerName: 'طنجة بيتش للعقارات الفاخرة',
    type: 'property',
    title: 'فيلا مطلة على البحر في أشقار',
    category: 'فيلا فاخرة / Villa',
    city: 'طنجة',
    pricePerUnit: 3500,
    unitLabel: 'درهم / ليلة',
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80'
    ],
    features: ['إطلالة مباشرة على المحيط', 'مسبح خاص', 'حديقة واسعة', 'طباخ خاص عند الطلب', 'جراج لسيارتين'],
    description: 'فيلا استثنائية للاستجمام العائلي في منطقة أشقار بطنجة بالقرب من مغارة هركليس.',
    specs: { rooms: '4 غرف نوم', area: '380 متر مربع', bathrooms: '4 حمامات' }
  }
];
