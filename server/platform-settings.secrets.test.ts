// Emergency P0 remediation — audit findings C1 / C2.
//
// C1: `admin.commissionSettings` ran `SELECT *` on `platform_settings`, so any
//     admin session received `ownerPasswordHash`, `ownerPasswordSalt` and
//     `sessionSecret` (a live owner password verifier + a session signing key).
// C2: `platform.settings.updated` wrote that same raw row into
//     `audit_logs.before_data`, persisting the credentials in 9 of 52 rows.
//
// Both guards below assert ZERO forbidden keys rather than "the value is
// redacted": the credentials must not cross the boundary at all.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  PLATFORM_SETTINGS_PUBLIC_KEYS,
  PLATFORM_SETTINGS_SECRET_KEYS,
  defaultPlatformSettings,
  sanitizePlatformSettingsSnapshot,
} from "./platformSettingsPolicy";

/** A synthetic `SELECT *` row: every public column plus every credential. */
const RAW_ROW: Record<string, unknown> = {
  id: 7,
  commissionRateBasisPoints: 1250,
  commissionMode: "percent",
  flatCommissionAmount: 0,
  vatRateBasisPoints: 2000,
  platformName: "ALTUSplace",
  contactEmail: "contact@altusplace.ma",
  contactPhone: "+212 5 22 00 00 00",
  maintenanceMode: false,
  ownerPasswordHash: "SCRAP$deadbeef$live-verifier",
  ownerPasswordSalt: "live-salt-value",
  sessionSecret: "live-session-signing-key",
  updatedBy: 1,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "admin",
      loginMethod: "test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const ROUTERS_SOURCE = readFileSync(resolve(import.meta.dirname, "routers.ts"), "utf8");

/**
 * Extracts one router field's source so assertions stay anchored to the
 * field under test instead of matching a string somewhere else in the file.
 */
function procedureSource(name: string): string {
  const match = new RegExp(`^    ${name}[:,]`, "m").exec(ROUTERS_SOURCE);
  if (!match) throw new Error(`router field "${name}" not found in server/routers.ts`);
  const rest = ROUTERS_SOURCE.slice(match.index);
  const end = rest.search(/\n    [A-Za-z_$][\w$]*\s*[:,]/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("platform settings credential containment (C1 / C2)", () => {
  it("keeps the public allowlist and the credential denylist disjoint", () => {
    for (const secret of PLATFORM_SETTINGS_SECRET_KEYS) {
      expect(PLATFORM_SETTINGS_PUBLIC_KEYS).not.toContain(secret);
    }
    expect(PLATFORM_SETTINGS_PUBLIC_KEYS.length).toBeGreaterThan(0);
  });

  it("projects a raw SELECT * row down to public columns only", () => {
    const snapshot = sanitizePlatformSettingsSnapshot(RAW_ROW)!;

    for (const secret of PLATFORM_SETTINGS_SECRET_KEYS) {
      expect(Object.keys(snapshot)).not.toContain(secret);
      expect(Object.values(snapshot)).not.toContain(RAW_ROW[secret]);
    }
    expect(JSON.stringify(snapshot)).not.toContain("live-session-signing-key");
    // The fields the admin console reads must survive the projection.
    expect(snapshot.platformName).toBe("ALTUSplace");
    expect(snapshot.commissionRateBasisPoints).toBe(1250);
    expect(snapshot.maintenanceMode).toBe(false);
  });

  it("returns null for a missing row so the caller keeps its fallback", () => {
    expect(sanitizePlatformSettingsSnapshot(undefined)).toBeNull();
    expect(sanitizePlatformSettingsSnapshot(null)).toBeNull();
  });

  it("admin.commissionSettings returns zero forbidden keys", async () => {
    const result = await appRouter.createCaller(adminContext()).admin.commissionSettings();
    const keys = Object.keys(result);

    for (const secret of PLATFORM_SETTINGS_SECRET_KEYS) {
      expect(keys).not.toContain(secret);
    }
    // With no DB the fallback is returned; it must be shaped identically.
    expect(keys.sort()).toEqual([...PLATFORM_SETTINGS_PUBLIC_KEYS].sort());
    expect(keys.sort()).toEqual(Object.keys(defaultPlatformSettings()).sort());
  });

  it("reads platform_settings through the allowlist, never SELECT *", () => {
    const source = procedureSource("commissionSettings");
    expect(source).toContain("PLATFORM_SETTINGS_PUBLIC_COLUMNS");
    expect(source).toContain("sanitizePlatformSettingsSnapshot");
    expect(source).not.toMatch(/db\.select\(\s*\)\s*\.from\(\s*platformSettings\s*\)/);
  });

  it("writes platform.settings.updated audit rows through the allowlist", () => {
    const source = procedureSource("updatePlatformSettings");
    expect(source).toContain("action: 'platform.settings.updated'");
    expect(source).toContain("beforeData: sanitizePlatformSettingsSnapshot(existing[0])");
    // The raw row must never be handed to writeAuditLog again.
    expect(source).not.toContain("beforeData: existing[0]");
    expect(source).not.toMatch(/db\.select\(\s*\)\s*\.from\(\s*platformSettings\s*\)/);
  });

  it("scrubs already-persisted audit rows without printing a value", async () => {
    const { scrubAuditPayload, FORBIDDEN_KEYS } = await import("../scripts/scrub-audit-secrets.mjs");
    const polluted = JSON.stringify({
      id: 1,
      platformName: "ALTUSplace",
      ownerPasswordHash: "SCRAP$deadbeef$live-verifier",
      sessionSecret: "live-session-signing-key",
    });

    const result = scrubAuditPayload(polluted);

    expect(result.changed).toBe(true);
    expect(result.keys.sort()).toEqual(
      ["ownerPasswordHash", "sessionSecret"].sort(),
    );
    expect(result.text).not.toContain("live-session-signing-key");
    expect(result.text).not.toContain("SCRAP$deadbeef$live-verifier");
    expect(result.text).toContain("[redacted]");
    // The public fields survive, so the audit entry stays readable.
    expect(JSON.parse(result.text!).platformName).toBe("ALTUSplace");
    expect(FORBIDDEN_KEYS).toContain("session_secret");

    // Clean payloads and non-JSON payloads are returned untouched.
    expect(scrubAuditPayload(JSON.stringify({ platformName: "x" })).changed).toBe(false);
    expect(scrubAuditPayload(null as unknown as string).changed).toBe(false);
    expect(scrubAuditPayload("not json").changed).toBe(false);
  });
});
