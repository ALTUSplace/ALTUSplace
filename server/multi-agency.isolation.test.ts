import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("multi-agency isolation audit", () => {
  it("keeps a distinct owner (agency) role separate from renters in the schema", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toMatch(/pgTable\("users"/);
    expect(schema).toContain('pgEnum("user_role", ["renter", "owner", "admin", "partner", "user", "SUPER_ADMIN"])');
    expect(schema).toContain("ownerId: integer(\"owner_id\")");
    expect(schema).toMatch(/agencyName: varchar\("agency_name"/);
  });

  it("scopes every owner listing-write procedure to the caller's own ownerId", () => {
    const routers = read("server/routers.ts");
    const scope = "eq(listings.ownerId, ctx.user!.id)";
    // Listing + agency-settings routes ride the partner tier (M-1): a
    // self-registered partner may manage their OWN listings/settings only.
    for (const proc of [
      "toggleAvailability: partnerProcedure",
      "setFleetStatus: partnerProcedure",
      "setAvailability: partnerProcedure",
      "saveIcalSettings: partnerProcedure",
      "syncIcalNow: partnerProcedure",
      "update",
      "remove: partnerProcedure",
      "mine: partnerProcedure",
    ]) {
      expect(routers).toContain(proc);
    }
    // Booking management, renter data and money stay on the owner tier.
    for (const proc of [
      "ownerUpdateStatus: ownerProcedure",
      "createForBooking: ownerProcedure",
      "ownerList: ownerProcedure",
      "ownerFinancials: ownerProcedure",
    ]) {
      expect(routers).toContain(proc);
    }
    // Every mutation adds the ownerId predicate to the WHERE before acting.
    expect(routers).toContain(scope);
    expect(routers).toContain("eq(bookings.id, input.bookingId), eq(listings.ownerId, ctx.user!.id)");
  });

  it("returns only the caller's own bookings from ownerList and ownerUpdateStatus", () => {
    const routers = read("server/routers.ts");
    const ownerList = routers.slice(routers.indexOf("ownerList: ownerProcedure"));
    expect(ownerList).toContain(".where(eq(listings.ownerId, ctx.user!.id))");
    expect(ownerList).toContain("الحجز غير موجود ضمن إعلاناتك.");
  });

  it("keeps a self-registered partner out of renter-data and money procedures", async () => {
    const trpcSource = read("server/_core/trpc.ts");
    // M-1: the owner tier must no longer list `partner` — it used to hand
    // bookings.ownerList (renter PII) to anyone who signed up as a partner.
    const ownerTier = trpcSource.match(/export const ownerProcedure = protectedProcedure\.use\([\s\S]*?\n\);/)?.[0] ?? "";
    expect(ownerTier).toContain("!['owner', 'admin', 'SUPER_ADMIN'].includes(ctx.user!.role)");
    expect(ownerTier).not.toContain("'partner'");
    // The partner tier mirrors the old owner list and is limited to own data.
    const partnerTier = trpcSource.match(/export const partnerProcedure = protectedProcedure\.use\([\s\S]*?\n\);/)?.[0] ?? "";
    expect(partnerTier).toContain("!['owner', 'admin', 'partner', 'SUPER_ADMIN'].includes(ctx.user!.role)");

    const partnerCaller = appRouter.createCaller({
      user: {
        id: 902,
        openId: "self-registered-partner",
        email: "partner@example.com",
        name: "Partenaire",
        loginMethod: "manus",
        role: "partner",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as never,
      res: {} as never,
    });
    await expect(partnerCaller.bookings.ownerList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partnerCaller.bookings.ownerUpdateStatus({ bookingId: 1, status: "Confirmed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partnerCaller.admin.ownerFinancials()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partnerCaller.payouts.request({ amount: 100, method: "bank_transfer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partnerCaller.rentalContracts.createForBooking({ bookingId: 1, language: "ar" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 30_000);

  it("lets a first-time agency register its own workspace via auth.becomeAgency", () => {
    const routers = read("server/routers.ts");
    const authBlock = routers.slice(routers.indexOf("auth: router({"), routers.indexOf("agency: router({"));
    expect(authBlock).toContain("becomeAgency: protectedProcedure");
    expect(authBlock).toContain("role: 'owner'");
    expect(authBlock).toContain('eq(users.id, ctx.user!.id)');
    expect(authBlock).toContain('action: "auth.become_agency"');
  });

  it("blocks cross-agency booking access for a regular renter", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 901,
        openId: "isolated-renter",
        email: "renter@example.com",
        name: "Renter",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as never,
      res: {} as never,
    });
    await expect(caller.listings.remove({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.bookings.ownerList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.agency.listings()).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 30_000);
});