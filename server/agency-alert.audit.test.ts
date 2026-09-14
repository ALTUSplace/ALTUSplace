import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf-8");

describe("agency contract + WhatsApp alert audit contracts", () => {
  it("only lets an agency generate the car rental PDF for its own confirmed bookings", () => {
    expect(routerSource).toMatch(/rentalContracts:\s*router\(\{[\s\S]*?bookingStatus !== "Confirmed"/);
    expect(routerSource).toMatch(/generateCarRentalContractPdf\(/);
    expect(routerSource).toMatch(/contracts\/car-rental\//);
    expect(routerSource).toMatch(/rental_contract\.generated/);
  });

  it("waits for the renter's KYC verification before booking (identity gate preserved)", () => {
    expect(routerSource).toMatch(/assertKycEligibleToBook\(/);
  });

  it("fires an instant WhatsApp alert to the agency phone when a booking is created", () => {
    expect(routerSource).toMatch(/sendWhatsAppText\(owner\[0\]\?\.whatsappPhone \?\? owner\[0\]\?\.agencyPhone/);
    expect(routerSource).toMatch(/type:\s*"booking_new"/);
  });
});