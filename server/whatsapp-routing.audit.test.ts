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