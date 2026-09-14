import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("airport flight tracking audit", () => {
  it("persists flightNumber and arrivalTime on the bookings table", () => {
    const schema = read("drizzle/schema.ts");
    const bookingsBlock = schema.slice(schema.indexOf('pgTable("bookings"'));
    expect(bookingsBlock).toContain('flightNumber: varchar("flight_number", { length: 24 })');
    expect(bookingsBlock).toContain('arrivalTime: timestamp("arrival_time")');
  });

  it("provides an additive SQL migration for the two columns", () => {
    const migration = read("drizzle/0007_add_booking_airport_flight_fields.sql");
    expect(migration).toContain('ALTER TABLE "bookings" ADD COLUMN "flight_number" varchar(24)');
    expect(migration).toContain('ALTER TABLE "bookings" ADD COLUMN "arrival_time" timestamp');
    const journal = read("drizzle/meta/_journal.json");
    expect(journal).toContain("0007_add_booking_airport_flight_fields");
  });

  it("accepts flight details in bookings.create and stores them", () => {
    const routers = read("server/routers.ts");
    const bookingsBlock = routers.slice(routers.indexOf("create: protectedProcedure"));
    expect(bookingsBlock).toContain("flightNumber: z.string().trim().max(24).optional()");
    expect(bookingsBlock).toContain("arrivalTime: z.string().optional()");
    expect(bookingsBlock).toContain("flightNumber: input.flightNumber?.trim() || null,");
    expect(bookingsBlock).toContain("arrivalTime: arrivalParsed,");
    expect(bookingsBlock).toContain("وقت وصول الرحلة غير صالح.");
  });

  it("returns the flight fields to the agency through ownerList", () => {
    const routers = read("server/routers.ts");
    const ownerList = routers.slice(routers.indexOf("ownerList: ownerProcedure"));
    expect(ownerList).toContain("flightNumber: bookings.flightNumber,");
    expect(ownerList).toContain("arrivalTime: bookings.arrivalTime,");
  });

  it("collects the flight number and arrival time on Casablanca pickups in checkout", () => {
    const checkout = read("client/src/pages/Checkout.tsx");
    expect(checkout).toContain("isAirportPickupMohammedV");
    expect(checkout).toContain("const pickupCity = (resolvedListing as { city?: string } | null)?.city?.trim() ?? ''");
    expect(checkout).toContain("pickupCity === 'الدار البيضاء'");
    expect(checkout).toContain('مطار محمد الخامس (النواصر)');
    expect(checkout).toContain('flightNumber: isAirportPickupMohammedV ? (flightNumber.trim() || undefined) : undefined');
    expect(checkout).toContain('id="flight-number"');
    expect(checkout).toContain('id="arrival-time"');
  });

  it("surfaces the flight in the agency bookings table and review modal", () => {
    const dashboard = read("client/src/pages/AgencyDashboard.tsx");
    expect(dashboard).toContain("flightNumber: string | null;");
    expect(dashboard).toContain("arrivalTime: string | Date | null;");
    expect(dashboard).toContain("booking.flightNumber &&");
    expect(dashboard).toContain("استلام من المطار:");
    expect(dashboard).toContain("Plane className=\"h-3 w-3\"");
  });
});