import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("agency onboarding audit", () => {
  it("rejects short agency names on the client before calling the API", () => {
    const onboarding = read("client/src/pages/AgencyOnboarding.tsx");
    expect(onboarding).toContain("AGENCY_NAME_MIN = 2");
    expect(onboarding).toContain("AGENCY_NAME_MAX = 80");
    expect(onboarding).toContain("trimmed.length < AGENCY_NAME_MIN");
    expect(onboarding).toContain("trimmed.length > AGENCY_NAME_MAX");
  });

  it("surfaces validation and server errors to the user", () => {
    const onboarding = read("client/src/pages/AgencyOnboarding.tsx");
    expect(onboarding).toContain('role="alert"');
    expect(onboarding).toContain("formatApiError");
    expect(onboarding).toContain("toast.error");
    expect(onboarding).toContain('aria-invalid');
  });

  it("keeps a reachable onboarding route outside the host-only guard", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('path="/become-agency"');
    expect(app).toContain('path="/agency/register"');
    const hostDashboard = read("client/src/pages/HostDashboard.tsx");
    expect(hostDashboard).toContain('<Redirect to="/become-agency" />');
    expect(hostDashboard).not.toContain("PartnerOnboarding");
  });

  it("does not let audit-logging failures break agency registration", () => {
    const routers = read("server/routers.ts");
    const start = routers.indexOf("becomeAgency: protectedProcedure");
    expect(start).toBeGreaterThan(-1);
    const nextProcedure = routers.indexOf("logout: publicProcedure", start);
    const block = routers.slice(start, nextProcedure > -1 ? nextProcedure : start + 2_000);
    expect(block).toContain("agencyName: z.string().trim().min(2).max(80)");
    expect(block).toContain("role: 'owner' as const");
    expect(block).toContain('"[becomeAgency] Audit log failed"');
    expect(block).toContain('"تعذر إتمام التسجيل. حاول مرة أخرى أو تواصل مع الدعم."');
  });
});
