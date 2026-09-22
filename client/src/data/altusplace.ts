/**
 * ALTUSplace / ALTUSplace — بيانات الواجهة التوضيحية (عقارات فقط)
 * ---------------------------------------------------------------------------
 * كتالوج العرض 2026 — الشقق المعتمدة للكراء اليومي/الشهري فقط.
 * أسطول السيارات أُزيل بالكامل (انظر client/src/data/catalog.ts).
 *
 * النصوص العربية نص UTF-8 عادي (RTL-safe): واجهة المستخدم تطبّق `dir="rtl"`
 * عبر Layout المشترك، لذلك لا حاجة لأي حيل ترميز — فقط نص عربي سليم.
 */

export interface PartnerProvider {
  id: string;
  name: string;
  type: 'property_management';
  city: string;
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
  type: 'property' | 'car';
  title: string;
  titleFr?: string;
  category: string;
  city: string;
  pricePerUnit: number;
  unitLabel: string;
  image: string;
  images: string[];
  features: string[];
  description: string;
  rating?: number;
  reviewCount?: number;
  amenities?: string[];
  descriptionFr?: string;
  /** True when the listing owner is an onboarded ALTUSplace partner/agency account. */
  providerVerified?: boolean;
  officeType?: string;
  rentalTerms?: string;
  specs: {
    rooms?: string;
    area?: string;
    bathrooms?: string;
    transmission?: string;
    fuel?: string;
    fuelType?: string;
    seats?: string | number;
    year?: number;
  };
}

export const PARTNERS: PartnerProvider[] = [
  {
    id: 'p1',
    name: 'ALTUSplace — كتالوج العرض 2026 (إدارة عقارية)',
    type: 'property_management',
    city: 'الدار البيضاء',
    phone: '',
    email: 'ALTUSplace@gmail.com',
    logo: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80',
    verified: true,
    status: 'active',
  },
];

export const LISTINGS: ListingItem[] = [
  {
    id: 'l1',
    providerId: 'p1',
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
    specs: { rooms: '3 غرف', area: '140 م²', bathrooms: '1 حمام رخام فاخر' }
  },
];
