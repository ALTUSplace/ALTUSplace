import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("real-estate property management audit", () => {
  it("adds propertyType and pricePerMonth to the unified listings table", () => {
    const schema = read("drizzle/schema.ts");
    const listingsBlock = schema.slice(schema.indexOf('pgTable("listings"'));
    expect(listingsBlock).toContain('propertyType: varchar("property_type", { length: 32 })');
    expect(listingsBlock).toContain('pricePerMonth: integer("price_per_month")');
  });

  it("provides an additive SQL migration for the two columns", () => {
    const migration = read("drizzle/0008_add_listing_property_monthly_pricing.sql");
    expect(migration).toContain('ALTER TABLE "listings" ADD COLUMN "property_type" varchar(32)');
    expect(migration).toContain('ALTER TABLE "listings" ADD COLUMN "price_per_month" integer');
    const journal = read("drizzle/meta/_journal.json");
    expect(journal).toContain("0008_add_listing_property_monthly_pricing");
  });

  it("accepts and persists property fields through listings.create", () => {
    const routers = read("server/routers.ts");
    const createBlock = routers.slice(routers.indexOf("create: ownerProcedure"));
    expect(createBlock).toContain("propertyType: z.string().trim().max(32).optional()");
    expect(createBlock).toContain("pricePerMonth: z.number().int().nonnegative().optional()");
    expect(createBlock).toContain("propertyType: input.propertyType,");
    expect(createBlock).toContain("pricePerMonth: input.pricePerMonth,");
  });

  it("accepts property fields through listings.update", () => {
    const routers = read("server/routers.ts");
    const updateBlock = routers.slice(routers.indexOf("update: ownerProcedure"));
    expect(updateBlock).toContain("propertyType: z.string().trim().max(32).nullable().optional()");
    expect(updateBlock).toContain("pricePerMonth: z.number().int().nonnegative().nullable().optional()");
    expect(updateBlock).toContain("rooms: z.number().int().nonnegative().optional()");
  });

  it("makes bookings.create document requirements category-aware", () => {
    const routers = read("server/routers.ts");
    const bookingsBlock = routers.slice(routers.indexOf("create: protectedProcedure"));
    expect(bookingsBlock).toContain("normalizeBookingCategory(listing[0].category ?? null)");
    expect(bookingsBlock).toContain('bookingCategory === "car" && (!input.drivingLicense || !input.identityDocument)');
    expect(bookingsBlock).toContain('bookingCategory !== "car" && !input.identityDocument');
    expect(bookingsBlock).toContain("المرجو إرفاق وثيقة الهوية مع حالة الإقامة.");
    expect(bookingsBlock).toContain('"السيارة / Véhicule" : "العقار / Bien"');
  });

  it("exposes the listing category to the agency through ownerList", () => {
    const routers = read("server/routers.ts");
    const ownerList = routers.slice(routers.indexOf("ownerList: ownerProcedure"));
    expect(ownerList).toContain("category: listings.category,");
  });

  it("runs the property checkout with identity-only documents", () => {
    const checkout = read("client/src/pages/Checkout.tsx");
    expect(checkout).toContain("isPropertyBooking");
    expect(checkout).toContain("isPropertyCategory(listingCategory)");
    expect(checkout).toContain("requireLicense: !isPropertyBooking");
    expect(checkout).toContain("drivingLicense: isPropertyBooking");
    expect(checkout).toContain("العقار' : 'السيارة'");
  });

  it("manages properties from the agency real-estate tab", () => {
    const dashboard = read("client/src/pages/AgencyDashboard.tsx");
    expect(dashboard).toContain("isPropertyCategory");
    expect(dashboard).toContain('TabsTrigger value="properties"');
    expect(dashboard).toContain("العقارات وأسعار الكراء");
    expect(dashboard).toContain("openAddProperty");
    expect(dashboard).toContain("pricePerMonth");
    expect(dashboard).toContain("propertyType");
  });

  it("surfaces real-estate listings in home and property detail", () => {
    const home = read("client/src/pages/Home.tsx");
    expect(home).toContain("isPropertyCategory");
    // The featured-properties action is localized: Home references the key,
    // and the Arabic string lives in the i18n dictionary.
    expect(home).toContain("featuredPropertiesAction");
    expect(home).toContain('type="property"');
    const dictionary = read("client/src/contexts/LanguageContext.tsx");
    expect(dictionary).toContain('featuredPropertiesAction: "استعرض العقارات"');
    const detail = read("client/src/pages/PropertyDetailWithVideo.tsx");
    expect(detail).toContain("pricePerMonth");
    expect(detail).toContain("rangeBlocked");
    expect(detail).toContain("getBookedDates");
  });
});