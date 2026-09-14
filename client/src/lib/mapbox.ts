export interface LatLng {
  lat: number;
  lng: number;
}

export const MOROCCO_CENTER: LatLng = { lat: 33.5731, lng: -7.5898 };

const CITY_COORDS: Record<string, LatLng> = {
  'طنجة': { lat: 35.7595, lng: -5.834 },
  'تطوان': { lat: 35.5889, lng: -5.3626 },
  'شفشاون': { lat: 35.1714, lng: -5.2697 },
  'العرائش': { lat: 35.1833, lng: -6.15 },
  'وزان': { lat: 34.7995, lng: -5.5786 },
  'الحسيمة': { lat: 35.2504, lng: -3.9376 },
  'المضيق': { lat: 35.755, lng: -5.378 },
  'وجدة': { lat: 34.6814, lng: -1.9086 },
  'الناظور': { lat: 35.1681, lng: -2.9335 },
  'بركان': { lat: 34.9281, lng: -2.315 },
  'تاوريرت': { lat: 34.407, lng: -2.897 },
  'جرسيف': { lat: 34.3188, lng: -3.3983 },
  'جرادة': { lat: 34.3137, lng: -1.9837 },
  'فاس': { lat: 34.0331, lng: -5.0003 },
  'مكناس': { lat: 33.8935, lng: -5.5547 },
  'صفرو': { lat: 33.8295, lng: -4.835 },
  'إفران': { lat: 33.5361, lng: -5.1278 },
  'تاونات': { lat: 34.5361, lng: -4.6433 },
  'الحاجب': { lat: 33.6917, lng: -5.3667 },
  'الرباط': { lat: 34.0209, lng: -6.8416 },
  'سلا': { lat: 34.0531, lng: -6.809 },
  'تمارة': { lat: 33.9289, lng: -6.912 },
  'القنيطرة': { lat: 34.261, lng: -6.58 },
  'الخميسات': { lat: 33.8172, lng: -6.063 },
  'سيدي سليمان': { lat: 34.2647, lng: -6.0394 },
  'سيدي قاسم': { lat: 34.2222, lng: -5.7044 },
  'الدار البيضاء': { lat: 33.5731, lng: -7.5898 },
  'المحمدية': { lat: 33.6889, lng: -7.3833 },
  'الجديدة': { lat: 33.2317, lng: -8.5 },
  'برشيد': { lat: 33.2667, lng: -7.5833 },
  'سطات': { lat: 33.0011, lng: -7.6166 },
  'سيدي بنور': { lat: 32.6561, lng: -8.4281 },
  'ابن سليمان': { lat: 33.6167, lng: -7.1167 },
  'مراكش': { lat: 31.6295, lng: -7.9811 },
  'آسفي': { lat: 32.2994, lng: -9.2372 },
  'الصويرة': { lat: 31.5085, lng: -9.7595 },
  'اليوسفية': { lat: 32.25, lng: -8.5167 },
  'شيشاوة': { lat: 31.5378, lng: -8.77 },
  'بني ملال': { lat: 32.3373, lng: -6.3498 },
  'خريبكة': { lat: 32.8811, lng: -6.9063 },
  'خنيفرة': { lat: 32.9397, lng: -5.6667 },
  'الفقيه بن صالح': { lat: 32.5, lng: -6.6833 },
  'أزيلال': { lat: 31.9667, lng: -6.5667 },
  'الرشيدية': { lat: 31.93, lng: -4.424 },
  'ورزازات': { lat: 30.9176, lng: -6.9111 },
  'تنغير': { lat: 31.5142, lng: -5.5308 },
  'زاكورة': { lat: 30.33, lng: -5.8333 },
  'ميدلت': { lat: 32.6872, lng: -4.7365 },
  'أغادير': { lat: 30.4278, lng: -9.5981 },
  'أكادير': { lat: 30.4278, lng: -9.5981 },
  'إنزكان': { lat: 30.365, lng: -9.5387 },
  'آيت ملول': { lat: 30.3344, lng: -9.4972 },
  'تارودانت': { lat: 30.4706, lng: -8.8766 },
  'تيزنيت': { lat: 29.699, lng: -9.725 },
  'كلميم': { lat: 28.985, lng: -10.0575 },
  'طانطان': { lat: 28.4353, lng: -11.1 },
  'سيدي إفني': { lat: 29.3795, lng: -10.1722 },
  'العيون': { lat: 27.1253, lng: -13.1625 },
  'السمارة': { lat: 26.74, lng: -11.68 },
  'بوجدور': { lat: 26.1333, lng: -14.4833 },
  'طرفاية': { lat: 27.939, lng: -12.926 },
  'الداخلة': { lat: 23.685, lng: -15.95 },
  // English / slug aliases used by ?city= params and search queries
  casablanca: { lat: 33.5731, lng: -7.5898 },
  casa: { lat: 33.5731, lng: -7.5898 },
  marrakech: { lat: 31.6295, lng: -7.9811 },
  marrakesh: { lat: 31.6295, lng: -7.9811 },
  agadir: { lat: 30.4278, lng: -9.5981 },
  tangier: { lat: 35.7595, lng: -5.834 },
  tanger: { lat: 35.7595, lng: -5.834 },
  rabat: { lat: 34.0209, lng: -6.8416 },
  fez: { lat: 34.0331, lng: -5.0003 },
  fes: { lat: 34.0331, lng: -5.0003 },
  meknes: { lat: 33.8935, lng: -5.5547 },
  oujda: { lat: 34.6814, lng: -1.9086 },
  laayoune: { lat: 27.1253, lng: -13.1625 },
  essaouira: { lat: 31.5085, lng: -9.7595 },
  nador: { lat: 35.1681, lng: -2.9335 },
  kenitra: { lat: 34.261, lng: -6.58 },
  sale: { lat: 34.0531, lng: -6.809 },
  tetouan: { lat: 35.5889, lng: -5.3626 },
  alhoceima: { lat: 35.2504, lng: -3.9376 },
  benimellal: { lat: 32.3373, lng: -6.3498 },
  khouribga: { lat: 32.8811, lng: -6.9063 },
  eljadida: { lat: 33.2317, lng: -8.5 },
  mohammedia: { lat: 33.6889, lng: -7.3833 },
  dakhla: { lat: 23.685, lng: -15.95 },
  ouarzazate: { lat: 30.9176, lng: -6.9111 },
  safi: { lat: 32.2994, lng: -9.2372 },
};

export function cityToCoords(city: string | null | undefined): LatLng | null {
  if (!city) return null;
  const normalized = city.trim().toLowerCase();
  const exact = CITY_COORDS[city.trim()] ?? CITY_COORDS[normalized];
  if (exact) return exact;
  for (const key of Object.keys(CITY_COORDS)) {
    if (key.trim().toLowerCase() === normalized) return CITY_COORDS[key];
  }
  return null;
}

export function getMapboxToken(): string | undefined {
  return (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) || undefined;
}

export function resolveListingCoords(lat?: number | null, lng?: number | null, city?: string | null): LatLng | null {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return cityToCoords(city);
}