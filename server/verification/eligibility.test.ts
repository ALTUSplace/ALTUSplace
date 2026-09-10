import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertKycEligibleToBook, getKycStatusPayload } from "./eligibility";

/** Minimal drizzle-shaped stub: select({}).from().where() resolves to `rows`. */
function fakeDb(rows: Array<{ documentType?: string; expiryDate?: Date | null } | Record<string, unknown>>) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    orderBy: () => chain,
    then: undefined,
  };
  const db = {
    select: () => {
      // Each select() call returns a fresh chain resolving to the same rows.
      const local = {
        from: () => local,
        where: () => local,
        orderBy: () => local,
        limit: () => Promise.resolve(rows),
      };
      return local;
    },
  };
  void chain;
  return db as unknown as Parameters<typeof assertKycEligibleToBook>[0]["db"];
}

const user = (status: string | null, role: string = "renter") => ({
  id: 7,
  role,
  kycVerificationStatus: status,
});

const licenceRow = { documentType: "driving_license", expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) };
const cniRow = { documentType: "cni", expiryDate: null };

describe("kyc booking eligibility", () => {
  it("blocks unverified users from booking anything", async () => {
    await expect(
      assertKycEligibleToBook({ db: fakeDb([licenceRow]), user: user(null), category: "car" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("التحقق من الهوية") });
  });

  it("blocks pending-review users", async () => {
    await expect(
      assertKycEligibleToBook({ db: fakeDb([licenceRow]), user: user("pending"), category: "car" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks rejected users", async () => {
    await expect(
      assertKycEligibleToBook({ db: fakeDb([]), user: user("rejected"), category: "property" }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("allows a verified driver with an approved licence to book a car", async () => {
    await expect(
      assertKycEligibleToBook({ db: fakeDb([licenceRow, cniRow]), user: user("verified"), category: "car" }),
    ).resolves.toBeUndefined();
  });

  it("allows a verified guest with an approved ID to book a property", async () => {
    await expect(
      assertKycEligibleToBook({ db: fakeDb([cniRow]), user: user("verified"), category: "real_estate" }),
    ).resolves.toBeUndefined();
  });

  it("blocks a verified user whose approved documents do not match the category", async () => {
    // Verified via CNI, but a car booking requires the licence.
    await expect(
      assertKycEligibleToBook({ db: fakeDb([cniRow]), user: user("verified"), category: "car" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", cause: { kyc: { reason: "KYC_DOCUMENT_REQUIRED" } } });
  });

  it("blocks bookings when the licence is expired", async () => {
    const expiredLicence = { documentType: "driving_license", expiryDate: new Date(Date.now() - 86_400_000) };
    await expect(
      assertKycEligibleToBook({ db: fakeDb([expiredLicence]), user: user("verified"), category: "car" }),
    ).rejects.toMatchObject({ cause: { kyc: { reason: "KYC_EXPIRED_DOCUMENT" } } });
  });

  it("exempts admins from the identity gate", async () => {
    await expect(
      assertKycEligibleToBook({ db: fakeDb([]), user: user(null, "admin"), category: "car" }),
    ).resolves.toBeUndefined();
  });

  it("returns an aggregated status payload", async () => {
    const payload = await getKycStatusPayload({ db: fakeDb([cniRow]), userId: 7 });
    expect(payload.status).toBe("unverified");
    expect(payload.approvedDocumentTypes).toEqual([]);
    expect(payload.requiredDocuments.car).toEqual(["driving_license"]);
  });
});