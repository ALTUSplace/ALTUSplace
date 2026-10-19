import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("profile and lease trust boundaries", () => {
  it("keeps contact and commercial-register updates behind protected auth", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("updateProfile: protectedProcedure");
    expect(routers).toContain("whatsappPhone: z.string().trim().max(32)");
    expect(routers).toContain("commercialRegister: z.string().trim().max(120)");
    expect(routers).toContain("where(eq(users.id, ctx.user!.id))");
  });

  it("uses landlord RC from the owner record when generating and persisting a lease", () => {
    const routers = read("server/routers.ts");
    const leaseStart = routers.indexOf("commercialLeaseContracts: router({");
    const leaseBlock = routers.slice(leaseStart);
    expect(leaseBlock).toContain("commercialRegister: users.commercialRegister");
    expect(leaseBlock).toContain("landlordRc: canonicalLandlordRc");
    expect(leaseBlock).toContain("landlordRc: canonicalLandlordRc,");
  });

  it("does not expose owner WhatsApp from an untrusted URL in Success", () => {
    const success = read("client/src/pages/Success.tsx");
    expect(success).not.toMatch(/searchParams\.get\(["'](?:phone|whatsapp|ownerPhone)["']\)/);
    // The success screen only ever reads the PUBLIC agency line (M-7); the
    // private booking-alert number never reaches the client payload.
    expect(success).toContain("booking?.agencyWhatsApp");
    expect(success).not.toMatch(/booking\??\.ownerWhatsApp/);
  });
});
