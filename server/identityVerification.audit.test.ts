import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("automated identity verification (kyc) audit", () => {
  it("tracks the provider, session and document metadata in the drizzle schema", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toMatch(/mysqlTable\("kyc_submissions"/);
    expect(schema).toContain('provider: varchar("provider"');
    expect(schema).toContain('providerSessionId: varchar("provider_session_id"');
    expect(schema).toContain('documentNumberMasked: varchar("document_number_masked"');
    expect(schema).toContain('expiryDate: timestamp("expiry_date")');
    expect(schema).toContain('categoryContext: varchar("category_context"');
    expect(schema).toContain('documentType: varchar("document_type"');
  });

  it("requires an approved category document before bookings.create succeeds", () => {
    const routers = read("server/routers.ts");
    const bookingsBlock = routers.slice(routers.indexOf("bookings: router({"));
    expect(bookingsBlock).toContain("assertKycEligibleToBook");
    expect(bookingsBlock).toContain("listing[0].category");
    // Only parameterized ORM queries — never raw string-concat SQL.
    expect(routers).not.toMatch(/db\.execute\s*\(\s*[`'"]/);
  });

  it("blocks payments.create for unverified profiles", () => {
    const routers = read("server/routers.ts");
    const paymentsBlock = routers.slice(routers.indexOf("payments: router({"));
    expect(paymentsBlock).toContain("assertKycEligibleToBook");
  });

  it("exposes kyc.status and the extended document types on the kyc router", () => {
    const routers = read("server/routers.ts");
    const kycBlock = routers.slice(routers.indexOf("kyc: router({"));
    expect(kycBlock).toContain("status: protectedProcedure.query");
    expect(kycBlock).toContain('"passport", "national_id"');
    expect(kycBlock).toContain("categoryContext: z.enum");
    expect(kycBlock).toContain("expiryDate: z.string().optional()");
  });

  it("mounts the signed verification webhook in the app entry point", () => {
    const entry = read("server/_core/index.ts");
    expect(entry).toContain("/api/v1/verification/webhook");
    expect(entry).toContain("createVerificationWebhookHandler");
    expect(entry).toContain("configureProviderSecrets");
  });

  it("gates the client checkout flow on the verification status", () => {
    const bookingPage = read("client/src/pages/Booking.tsx");
    expect(bookingPage).toContain("trpc.kyc.status.useQuery");
    expect(bookingPage).toContain("isKycSatisfiedFor");
    expect(bookingPage).toContain("kycBlocked");

    const checkoutPage = read("client/src/pages/Checkout.tsx");
    expect(checkoutPage).toContain("trpc.kyc.status.useQuery");
    expect(checkoutPage).toContain("isKycSatisfiedFor");
    expect(checkoutPage).toContain("setLocation('/kyc')");
  });

  it("documents car vs property requirements in the verification module", () => {
    const requirements = read("server/verification/requirements.ts");
    expect(requirements).toContain('car: DRIVING_LICENCE_VALUES');
    expect(requirements).toContain('property: PROPERTY_ID_VALUES');
    expect(requirements).toContain('"driving_license"');
    expect(requirements).toContain('"passport"');
  });
});