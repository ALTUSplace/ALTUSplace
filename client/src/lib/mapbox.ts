export interface LatLng {
  lat: number;
  lng: number;
}

export const MOROCCO_CENTER: LatLng = { lat: 33.5731, lng: -7.5898 };

const CITY_COORDS: Record<string, LatLng> = {
  'الدار البيضاء': { lat: 33.5731, lng: -7.5898 },
  'مراكش': { lat: 31.6295, lng: -7.9811 },
  'أغادير': { lat: 30.4278, lng: -9.5981 },
  'طنجة': { lat: 35.7595, lng: -5.834 },
  'الرباط': { lat: 34.0209, lng: -6.8416 },
  'فاس': { lat: 34.0331, lng: -5.0003 },
  'مكناس': { lat: 33.8935, lng: -5.5547 },
  'وجدة': { lat: 34.6814, lng: -1.9086 },
  'العيون': { lat: 27.1253, lng: -13.1625 },
  'الصويرة': { lat: 31.5085, lng: -9.7595 },
  'أكادير': { lat: 30.4278, lng: -9.5981 },
  'الناظور': { lat: 35.1681, lng: -2.9335 },
  'بني ملال': { lat: 32.3373, lng: -6.3498 },
  'خريبكة': { lat: 32.8811, lng: -6.9063 },
  // English / slug aliases used by ?city= params and search queries
  casablanca: { lat: 33.5731, lng: -7.5898 },
  marrakech: { lat: 31.6295, lng: -7.9811 },
  agadir: { lat: 30.4278, lng: -9.5981 },
  tangier: { lat: 35.7595, lng: -5.834 },
  rabat: { lat: 34.0209, lng: -6.8416 },
  fez: { lat: 34.0331, lng: -5.0003 },
  fes: { lat: 34.0331, lng: -5.0003 },
  meknes: { lat: 33.8935, lng: -5.5547 },
  oujda: { lat: 34.6814, lng: -1.9086 },
  laayoune: { lat: 27.1253, lng: -13.1625 },
  essaouira: { lat: 31.5085, lng: -9.7595 },
  nador: { lat: 35.1681, lng: -2.9335 },
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