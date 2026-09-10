import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("invoice and profile audit contracts", () => {
  const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
  const checkoutPage = readFileSync(resolve(process.cwd(), "client/src/pages/Checkout.tsx"), "utf8");
  const successPage = readFileSync(resolve(process.cwd(), "client/src/pages/Success.tsx"), "utf8");
  const profilePage = readFileSync(resolve(process.cwd(), "client/src/pages/Profile.tsx"), "utf8");
  const bookingsPage = readFileSync(resolve(process.cwd(), "client/src/pages/MyBookings.tsx"), "utf8");

  it("keeps invoice schema and protected list/get procedures aligned", () => {
    expect(schemaSource).toMatch(/export const invoices = pgTable\("invoices"/);
    expect(schemaSource).toMatch(/vatRateBasisPoints/);
    expect(routerSource).toMatch(/invoices:\s*router\(/);
    expect(routerSource).toMatch(/list:\s*protectedProcedure/);
    expect(routerSource).toMatch(/invoices\.payerId, ctx\.user!\.id/);
    expect(routerSource).toMatch(/getByBooking:\s*protectedProcedure/);
    expect(routerSource).toMatch(/invoice\.payerId !== ctx\.user!\.id/);
  });

  it("calculates payment and invoice amounts from canonical booking values", () => {
    expect(routerSource).toMatch(/payments:\s*router\([\s\S]*?booking\.totalPrice, booking\.commissionFee/);
    expect(routerSource).toMatch(/payments:\s*router\([\s\S]*?simulated:\s*true/);
    expect(routerSource).toMatch(/payments:\s*router\([\s\S]*?invoiceNumber:\s*createInvoiceNumber\(booking\.id\)/);
    expect(checkoutPage).toMatch(/createBookingMutation\.mutate\(\{\s*listingId,\s*startDate:/s);
    expect(checkoutPage).not.toMatch(/createBookingMutation\.mutate\([\s\S]*?totalPrice/);
    expect(checkoutPage).not.toMatch(/name=["'](?:cardNumber|cvv|cardHolder)["']/i);
  });

  it("renders invoice download actions from protected API results", () => {
    expect(profilePage).toMatch(/useAuth\(\{ redirectOnUnauthenticated: true \}\)/);
    expect(profilePage).toMatch(/trpc\.bookings\.list\.useQuery/);
    expect(profilePage).toMatch(/trpc\.invoices\.list\.useQuery/);
    expect(profilePage).toMatch(/generateInvoicePdf\(invoice\)/);
    expect(profilePage).not.toMatch(/booking[s]?\s*=\s*\[/i);
    expect(bookingsPage).toMatch(/trpc\.invoices\.list\.useQuery/);
    expect(bookingsPage).toMatch(/الفاتورة PDF/);
    expect(successPage).toMatch(/trpc\.invoices\.getByBooking\.useQuery/);
    expect(successPage).toMatch(/generateInvoicePdf\(\{[\s\S]*\.\.\.invoice/);
  });

  it("does not generate the lease contract before owner approval", () => {
    expect(routerSource).toMatch(/getById:\s*protectedProcedure[\s\S]*?booking\.renterId !== ctx\.user!\.id/);
    expect(successPage).toMatch(/trpc\.bookings\.getById\.useQuery/);
    expect(successPage).toMatch(/const isPending = !booking \|\| bookingStatus !== ['"]Confirmed['"]/);
    expect(successPage).not.toMatch(/const bookingStatus = searchParams\.get\(['"]bookingStatus/);
    expect(routerSource).toMatch(/commercialLeaseContracts:[\s\S]*?booking\[0\]\.status !== "Confirmed"/);
  });
});
