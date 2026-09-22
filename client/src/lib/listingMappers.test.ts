import { describe, expect, it } from "vitest";
import { toListingItem } from "./listingMappers";

const base = {
  id: 7,
  ownerId: 1928,
  title: "Dacia Duster",
  titleFr: null,
  description: "Test listing",
  category: "car",
  pricePerDay: 400,
  imageUrl: "https://example.com/duster.jpg",
  images: null,
  averageRating: 4.5,
  reviewCount: 3,
  city: "Casablanca",
  fuelType: "diesel",
  transmission: "manual",
  seats: 5,
  area: null,
  year: 2021,
  rooms: null,
  officeType: null,
  rentalPeriod: "daily",
  amenities: null,
};

describe("toListingItem — partner-verified mapping", () => {
  it("maps ownerRole 'partner' to providerVerified true", () => {
    const item = toListingItem({ ...base, ownerRole: "partner" });
    expect(item.providerVerified).toBe(true);
  });

  it("maps non-partner roles to providerVerified false", () => {
    expect(toListingItem({ ...base, ownerRole: "owner" }).providerVerified).toBe(false);
    expect(toListingItem({ ...base, ownerRole: "renter" }).providerVerified).toBe(false);
    expect(toListingItem({ ...base, ownerRole: "admin" }).providerVerified).toBe(false);
  });

  it("maps absent or null ownerRole to providerVerified false", () => {
    expect(toListingItem(base).providerVerified).toBe(false);
    expect(toListingItem({ ...base, ownerRole: null }).providerVerified).toBe(false);
  });
});