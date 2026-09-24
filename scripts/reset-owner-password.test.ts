import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the app's ownerAuth helpers so tests never touch a real DB and can
// assert the script delegates exactly to the existing scrypt helper.
vi.mock("../server/_core/ownerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/_core/ownerAuth")>();
  return {
    ...actual,
    setOwnerPassword: vi.fn(),
    verifyOwnerPassword: vi.fn(),
  };
});

import { MIN_PASSWORD_LENGTH, resolveOwnerRow, runReset, validateResetInputs } from "./reset-owner-password";
import { setOwnerPassword, verifyOwnerPassword } from "../server/_core/ownerAuth";

const mockedSetOwnerPassword = vi.mocked(setOwnerPassword);
const mockedVerifyOwnerPassword = vi.mocked(verifyOwnerPassword);

type FakeUserRow = { openId: string; role: string };

function fakeDb(rows: FakeUserRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  };
}

describe("validateResetInputs", () => {
  it("accepts well-formed inputs and normalizes whitespace and quote wrappers", () => {
    const result = validateResetInputs({
      OWNER_EMAIL: "  owner@altusplace.ma  ",
      NEW_PASSWORD: '"AltusPlace@2026!"',
    });
    expect(result).toEqual({ ownerEmail: "owner@altusplace.ma", newPassword: "AltusPlace@2026!" });
  });

  it("rejects a missing OWNER_EMAIL", () => {
    expect(() => validateResetInputs({ NEW_PASSWORD: "x".repeat(MIN_PASSWORD_LENGTH) })).toThrow(/OWNER_EMAIL is required/);
  });

  it("rejects a missing NEW_PASSWORD", () => {
    expect(() => validateResetInputs({ OWNER_EMAIL: "owner@altusplace.ma" })).toThrow(/NEW_PASSWORD is required/);
  });

  it(`rejects a NEW_PASSWORD shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(() => validateResetInputs({ OWNER_EMAIL: "owner@altusplace.ma", NEW_PASSWORD: "short" })).toThrow(
      /at least 8 characters/,
    );
  });
});

describe("resolveOwnerRow", () => {
  const nonOwnerRows: FakeUserRow[] = [
    { openId: "partner-1", role: "partner" },
    { openId: "user-1", role: "user" },
  ];

  it("throws when no matching users row is an owner", () => {
    expect(() => resolveOwnerRow(nonOwnerRows, "someone@altusplace.ma")).toThrow(
      /is not an owner row .*partner\/partner-1, user\/user-1/,
    );
  });

  it("resolves a SUPER_ADMIN direct-login owner row", () => {
    const row = resolveOwnerRow([{ openId: "owner-direct-login", role: "SUPER_ADMIN" }], "owner@altusplace.ma");
    expect(row.role).toBe("SUPER_ADMIN");
  });

  it("resolves an owner-role row", () => {
    const row = resolveOwnerRow([{ openId: "owner-1", role: "owner" }], "owner@altusplace.ma");
    expect(row.role).toBe("owner");
  });
});

describe("runReset", () => {
  afterEach(() => vi.clearAllMocks());

  it("delegates to the existing setOwnerPassword helper and self-verifies", async () => {
    mockedSetOwnerPassword.mockResolvedValue(undefined);
    mockedVerifyOwnerPassword.mockResolvedValue(true);
    const db = fakeDb([{ openId: "owner-direct-login", role: "SUPER_ADMIN" }]);

    await runReset(db as never, { ownerEmail: "owner@altusplace.ma", newPassword: "AltusPlace@2026!" });

    expect(mockedSetOwnerPassword).toHaveBeenCalledWith("AltusPlace@2026!");
    expect(mockedVerifyOwnerPassword).toHaveBeenCalledWith("AltusPlace@2026!");
  });

  it("fails when post-reset verification fails", async () => {
    mockedSetOwnerPassword.mockResolvedValue(undefined);
    mockedVerifyOwnerPassword.mockResolvedValue(false);
    const db = fakeDb([{ openId: "owner-direct-login", role: "SUPER_ADMIN" }]);

    await expect(
      runReset(db as never, { ownerEmail: "owner@altusplace.ma", newPassword: "AltusPlace@2026!" }),
    ).rejects.toThrow(/Post-reset verification failed/);
  });

  it("refuses to reset when the email is not an owner row (no helper call)", async () => {
    const db = fakeDb([{ openId: "user-1", role: "user" }]);

    await expect(
      runReset(db as never, { ownerEmail: "user@altusplace.ma", newPassword: "AltusPlace@2026!" }),
    ).rejects.toThrow(/is not an owner row/);
    expect(mockedSetOwnerPassword).not.toHaveBeenCalled();
  });
});