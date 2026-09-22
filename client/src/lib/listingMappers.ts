import { ListingItem } from "@/data/altusplace";
import { isCarCategory } from "./categories";

/**
 * Parses a JSON-array or comma-separated string column into a string[].
 * Legacy rows may contain comma-separated amenities, so plain strings
 * are split instead of failing.
 */
export const parseArrayField = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // Legacy rows may contain comma-separated amenities.
  }
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
};

/**
 * Maps a raw listing row (listings.list / listings.search / getById payload)
 * into the shared client ListingItem shape. The `ownerRole` field drives the
 * partner-verified badge: only onboarded `partner` accounts are verified.
 */
export const toListingItem = (item: {
  id: number;
  ownerId: number;
  ownerRole?: string | null;
  title: string;
  titleFr?: string | null;
  description: string | null;
  category: string;
  pricePerDay: number;
  imageUrl: string | null;
  images?: string[] | null;
  averageRating?: number | null;
  reviewCount?: number | null;
  city: string;
  fuelType: string | null;
  transmission: string | null;
  seats?: number | null;
  area?: number | null;
  year?: number | null;
  rooms: number | null;
  officeType: string | null;
  rentalPeriod: "daily" | "monthly" | "yearly" | null;
  amenities: string | null;
  dynamicPricePerDay?: number;
  ownerName?: string | null;
}): ListingItem => {
  const amenities = parseArrayField(item.amenities);
  const type: ListingItem["type"] = isCarCategory(item.category) ? "car" : "property";
  const unitLabel = item.rentalPeriod === "monthly" ? "درهم / شهر" : item.rentalPeriod === "yearly" ? "درهم / سنة" : "درهم / يوم";
  return {
    id: String(item.id),
    providerId: String(item.ownerId),
    providerName: item.ownerName || `مالك الإعلان #${item.ownerId}`,
    type,
    title: item.title,
    titleFr: item.titleFr ?? undefined,
    category: item.category,
    city: item.city,
    pricePerUnit: item.dynamicPricePerDay ?? item.pricePerDay,
    unitLabel,
    image: item.images?.[0] || item.imageUrl || "",
    images: item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : [],
    rating: item.averageRating ?? 0,
    reviewCount: item.reviewCount ?? 0,
    features: [item.fuelType, item.transmission, ...amenities].filter((value): value is string => Boolean(value)),
    description: item.description || "",
    specs: {
      transmission: item.transmission || undefined,
      fuel: item.fuelType || undefined,
      rooms: item.rooms ? String(item.rooms) : undefined,
      seats: item.seats && item.seats > 0 ? String(item.seats) : undefined,
      area: item.area && item.area > 0 ? `${item.area} m²` : undefined,
      year: item.year ?? undefined,
    },
    providerVerified: item.ownerRole === "partner",
  };
};