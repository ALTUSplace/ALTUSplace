import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

describe("per-agency WhatsApp routing audit contracts", () => {
  it("validates the agency/renter WhatsApp number in both profile and settings routers", () => {
    const routers = read("server/routers.ts");
    const schemaGuard = /whatsappPhone: z\.string\(\)\.trim\(\)\.max\(32\)\.refine\(\(value\) => !value \|\| normalizeWhatsAppNumber\(value\) !== null/g;
    expect(count(routers, schemaGuard)).toBe(2);
    expect(count(routers, /رقم واتساب غير صالح/g)).toBe(2);
  });

  it("persists the normalized international number to the database in both routers", () => {
    const routers = read("server/routers.ts");
    const normalizedStore = /whatsappPhone: normalizeWhatsAppNumber\(input\.whatsappPhone \?\? ""\) \?\? null,\r?\n/g;
    expect(count(routers, normalizedStore)).toBe(2);
  });

  it("logs the WhatsApp number change to the agency audit trail", () => {
    const routers = read("server/routers.ts");
    expect(routers).toMatch(/afterData: \{\s*agencyName: normalize\(input\.agencyName\), agencyPhone: normalize\(input\.agencyPhone\), agencyEmail: normalize\(input\.agencyEmail\), whatsappPhone: normalizeWhatsAppNumber\(input\.whatsappPhone \?\? ""\) \?\? null(?:, whatsappNumber: normalizeWaNumber\(input\.whatsappNumber \?\? ""\) \?\? null)? \}/);
  });

  it("stores both the general phone and the dedicated WhatsApp number per vendor", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain('whatsappPhone: varchar("whatsapp_phone", { length: 32 })');
    expect(schema).toContain('agencyPhone: varchar("agency_phone", { length: 32 })');
  });

  it("routes booking alerts to the vendor number only, never a global admin constant", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("sendWhatsAppText(owner[0]?.whatsappPhone ?? owner[0]?.agencyPhone");
    const recipients = routers.match(/sendWhatsAppText\(\s*[^\n]*\)/g) ?? [];
    for (const call of recipients) {
      expect(call).not.toMatch(/\d{9,}/);
    }
  });
});

describe("agency WhatsApp CTA gating (post-submission only)", () => {
  it("removes every WhatsApp CTA from the public listing pages (no wa.me link)", () => {
    for (const page of [
      "client/src/pages/CarDetails.tsx",
      "client/src/pages/PropertyDetailWithVideo.tsx",
      "client/src/components/ui/ListingCard.tsx", // pre-submission browse surface
      "client/src/pages/Home.tsx",
      "client/src/pages/Search.tsx",
      "client/src/pages/Favorites.tsx",
      "client/src/pages/LocationLanding.tsx",
    ]) {
      const source = read(page);
      expect(count(source, /https:\/\/wa\.me/g)).toBe(0);
      expect(count(source, /<WhatsAppContactButton/g)).toBe(0);
      expect(count(source, /<FloatingWhatsAppButton/g)).toBe(0);
    }
  });

  it("removes the pre-submission WhatsApp CTAs from the property booking card", () => {
    const property = read("client/src/pages/PropertyDetailWithVideo.tsx");
    expect(property).not.toContain("تأكيد الحجز عبر الواتساب");
    expect(property).not.toContain("تواصل عبر واتساب");
    expect(property).not.toContain("Réserver via WhatsApp");
  });

  it("keeps exactly one wa.me deep link on the post-submission success screen", () => {
    const success = read("client/src/pages/Success.tsx");
    // The success screen builds exactly one agency wa.me deep link (waChatUrl);
    // the main CTA and the download-dialog CTA both open that same single link.
    expect(count(success, /buildWaMeUrl\(/g)).toBe(1);
    expect(count(success, /onClick=\{handleWhatsappContact\}/g)).toBe(2);
  });

  it("exposes exactly one WhatsApp CTA on the post-submission bookings page", () => {
    const myBookings = read("client/src/pages/MyBookings.tsx");
    expect(count(myBookings, /<WhatsAppContactButton/g)).toBe(1);
    expect(count(myBookings, /buildWaMeUrl\(/g)).toBe(1);
    // Gated on confirmed bookings so a pending request never surfaces the CTA.
    expect(myBookings).toMatch(/isConfirmed \? buildWaMeUrl\(booking\.agencyWhatsApp, waMessage\) : ""/);
  });

  it("never leaks an agency contact number for an unconfirmed booking", () => {
    const routers = read("server/routers.ts");
    // bookings.list and bookings.getById must both gate the number on status.
    expect(routers).toMatch(/agencyWhatsApp: row\.status === "Confirmed" \? row\.agencyWhatsApp : null/);
    expect(routers).toMatch(/agencyWhatsApp: booking\.status === "Confirmed" \? booking\.agencyWhatsApp : null/);
    expect(count(routers, /agencyWhatsApp: users\.whatsappNumber/g)).toBe(2);
  });
});
