import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALREADY_ELEVATED_ROLES, evaluateBecomeAgencyAccess, isElevatedRole } from "./becomeAgencyPolicy";

/**
 * Guard tests for audit finding H1 — `auth.becomeAgency` self-service
 * privilege escalation.
 *
 * The mutation used to promote ANY authenticated account from `user` to the
 * `owner` (agency) tier with no approval step. It now requires a
 * `partner_applications` row with `status = 'approved'`.
 */

describe("evaluateBecomeAgencyAccess policy", () => {
  it("denies a bare user (no approved application) with FORBIDDEN (403)", () => {
    const decision = evaluateBecomeAgencyAccess({ role: "user", hasApprovedApplication: false });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("FORBIDDEN");
      expect(decision.message.length).toBeGreaterThan(0);
    }
  });

  it("denies a pending or rejected application", () => {
    // Only an explicit `approved` flag can reach this function as `true`;
    // pending/rejected both map to `hasApprovedApplication: false`.
    for (const status of ["pending", "rejected"] as const) {
      const decision = evaluateBecomeAgencyAccess({ role: "user", hasApprovedApplication: status === "approved" });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.code).toBe("FORBIDDEN");
    }
  });

  it("allows a user whose partner application is approved (200)", () => {
    expect(evaluateBecomeAgencyAccess({ role: "user", hasApprovedApplication: true })).toEqual({ allowed: true });
    expect(evaluateBecomeAgencyAccess({ role: "guest", hasApprovedApplication: true })).toEqual({ allowed: true });
  });

  it("preserves the original CONFLICT behaviour for already-elevated roles", () => {
    for (const role of ALREADY_ELEVATED_ROLES) {
      const withApproval = evaluateBecomeAgencyAccess({ role, hasApprovedApplication: true });
      expect(withApproval.allowed).toBe(false);
      if (!withApproval.allowed) expect(withApproval.code).toBe("CONFLICT");

      const withoutApproval = evaluateBecomeAgencyAccess({ role, hasApprovedApplication: false });
      expect(withoutApproval.allowed).toBe(false);
      if (!withoutApproval.allowed) expect(withoutApproval.code).toBe("CONFLICT");
    }
  });

  it("never allows elevation without an approved application, for any role", () => {
    for (const role of [...ALREADY_ELEVATED_ROLES, "user", "unknown-role", ""]) {
      expect(evaluateBecomeAgencyAccess({ role, hasApprovedApplication: false }).allowed).toBe(false);
    }
  });

  it("recognises exactly the four elevated roles", () => {
    expect(ALREADY_ELEVATED_ROLES).toEqual(["owner", "admin", "partner", "SUPER_ADMIN"]);
    expect(isElevatedRole("owner")).toBe(true);
    expect(isElevatedRole("admin")).toBe(true);
    expect(isElevatedRole("partner")).toBe(true);
    expect(isElevatedRole("SUPER_ADMIN")).toBe(true);
    expect(isElevatedRole("user")).toBe(false);
    expect(isElevatedRole("User")).toBe(false);
  });
});

describe("routers.ts wiring", () => {
  const root = resolve(import.meta.dirname, "..");
  const routers = readFileSync(resolve(root, "server", "routers.ts"), "utf8");

  function procedureBlock(startMarker: string, endMarker: string): string {
    const start = routers.indexOf(startMarker);
    expect(start, `missing ${startMarker}`).toBeGreaterThan(-1);
    const end = routers.indexOf(endMarker, start);
    expect(end, `missing ${endMarker} after ${startMarker}`).toBeGreaterThan(start);
    return routers.slice(start, end);
  }

  it("gates becomeAgency on evaluateBecomeAgencyAccess", () => {
    const block = procedureBlock("becomeAgency: protectedProcedure", "logout: publicProcedure");
    expect(block).toContain("evaluateBecomeAgencyAccess");
    expect(block).toContain("hasApprovedApplication");
    expect(block).toContain("isElevatedRole");
    // The approval lookup must be scoped to status = 'approved'.
    expect(block).toMatch(/eq\(partnerApplications\.status,\s*"approved"\)/);
    expect(block).toContain("partnerApplications.email");
    // No un-gated direct promotion left behind.
    expect(block).not.toMatch(/\[(['"])owner\1,\s*(['"])admin\1,\s*(['"])partner\1,\s*(['"])SUPER_ADMIN\1\]\.includes/);
    // Errors are surfaced through the policy decision, never hardcoded here.
    expect(block).toContain("access.code");
    expect(block).toContain("access.message");
  });

  it("imports the policy from routers.ts", () => {
    expect(routers).toMatch(/import\s*\{[^}]*evaluateBecomeAgencyAccess[^}]*\}\s*from\s*"\.\/becomeAgencyPolicy"/);
  });

  it("has no client caller of auth.becomeAgency (safe to harden)", () => {
    const clientRoot = resolve(root, "client", "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && readFileSync(full, "utf8").includes("becomeAgency")) {
          offenders.push(full.slice(clientRoot.length + 1));
        }
      }
    };
    walk(clientRoot);
    expect(offenders).toEqual([]);
  });
});
