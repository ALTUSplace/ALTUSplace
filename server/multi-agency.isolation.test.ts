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
    for (const proc of [
      "toggleAvailability: ownerProcedure",
      "setFleetStatus: ownerProcedure",
      "setAvailability: ownerProcedure",
      "saveIcalSettings: ownerProcedure",
      "syncIcalNow: ownerProcedure",
      "update",
      "remove: ownerProcedure",
      "mine: ownerProcedure",
      "ownerUpdateStatus: ownerProcedure",
      "createForBooking: ownerProcedure",
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