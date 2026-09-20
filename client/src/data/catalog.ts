/**
 * ALTUSplace - Catalog 2026 (properties only)
 * The car-rental fleet (Duster, Clio, 208, Tucson, CLA, Wrangler) has been
 * permanently removed. Only verified apartments remain:
 *   - Beausejour (Bousigour):  3 rooms, 140 m2, daily
 *   - Racine:                  2 rooms, 60 m2,  monthly
 */

export type PropertyType =
  | "apartment"
  | "apartment_share"
  | "office"
  | "coworking"
  | "store"
  | "land"
  | "warehouse"
  | "restaurant"
  | "villa"
  | "riad"
  | "studio";

export interface CatalogItem {
  id: string;
  slug: string;
  type: "property";
  propertyType: PropertyType;
  title: string;
  titleFr: string;
  category: "apartment";
  city: string;
  region?: string;
  pricePerUnit: number;
  unitLabel: "per_night" | "per_month";
  image: string;
  images: string[];
  description: string;
  descriptionFr?: string;
  features: string[];
  specs: {
    rooms: string;
    area: string;
    bathrooms: string;
    floor?: string;
    furnished?: boolean;
    year?: number;
  };
  status: "available" | "booked" | "reserved";
  dailyRentEnabled: boolean;
  monthlyRentEnabled: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
}

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "ap-beausejour-01",
    slug: "beausejour-furnished-apartment-3-rooms",
    type: "property",
    propertyType: "apartment",
    title: "Shuqqa m'uaththatha 3 ghuraf 140 m2 - Bousigour, Casablanca",
    titleFr: "Appartement meuble 3 chambres 140 m2 - Beausejour, Casablanca",
    category: "apartment",
    city: "Casablanca",
    region: "Beausejour",
    pricePerUnit: 700,
    unitLabel: "per_night",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    ],
    description: "Cahand APT VERIFIED daily rent Beausejour Casablanca.",
    descriptionFr: "Appartement verifie - location journaliere Beausejour.",
    features: ["Climatisation", "Meuble", "WiFi", "Cuisine equipee"],
    specs: {
      rooms: "3 rooms",
      area: "140 m2",
      bathrooms: "2",
      floor: "4e",
      furnished: true,
      year: 2023,
    },
    status: "available",
    dailyRentEnabled: true,
    monthlyRentEnabled: true,
    verified: true,
    rating: 4.9,
    reviewCount: 128,
  },
  {
    id: "ap-racine-01",
    slug: "furnished-apartment-racine-casablanca",
    type: "property",
    propertyType: "apartment",
    title: "Shuqqa m'uaththatha ghurfatan 60 m2 - Racine, Casablanca",
    titleFr: "Appartement meuble 2 chambres 60 m2 - Racine, Casablanca",
    category: "apartment",
    city: "Casablanca",
    region: "Racine",
    pricePerUnit: 400,
    unitLabel: "per_month",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    ],
    description: "Racine APT VERIFIED monthly rent Casablanca.",
    descriptionFr: "Appartement verifie - location mensuelle Racine.",
    features: ["Climatisation", "Meuble", "Parking", "WiFi"],
    specs: {
      rooms: "2 rooms",
      area: "60 m2",
      bathrooms: "1",
      furnished: true,
      year: 2021,
    },
    status: "available",
    dailyRentEnabled: true,
    monthlyRentEnabled: true,
    verified: true,
    rating: 4.8,
    reviewCount: 97,
  },
];
