import { describe, expect, it } from "vitest";
import { calculateCommission, isVendorTier, normalizeCommissionSettings, resolveEffectiveCommission } from "./escrow";

function fakeDb(rowsByTable: Record<string, () => unknown[]>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableNameOf = (table: any) => (table && table[Symbol.for("drizzle:Name")]) as string;
  const chain = {
    select: () => ({
      from: (table: object) => {
        const rows = () => rowsByTable[tableNameOf(table)]?.() ?? [];
        return {
          where: () => ({ limit: (n: number) => Promise.resolve(rows().slice(0, n)) }),
          limit: (n: number) => Promise.resolve(rows().slice(0, n)),
        };
      },
    }),
  };
  return chain as never;
}

describe("commission splitting", () => {
  it("computes percent commission", () => {
    expect(calculateCommission(10000, { mode: "percent", percentBasisPoints: 1000, flatAmount: 0 })).toBe(1000);
    expect(calculateCommission(10000, { mode: "percent", percentBasisPoints: 600, flatAmount: 0 })).toBe(600);
  });

  it("computes flat commission capped at subtotal", () => {
    expect(calculateCommission(10000, { mode: "flat", percentBasisPoints: 0, flatAmount: 1200 })).toBe(1200);
    expect(calculateCommission(500, { mode: "flat", percentBasisPoints: 0, flatAmount: 1200 })).toBe(500);
  });

  it("rejects invalid subtotals", () => {
    expect(() => calculateCommission(-1, { mode: "percent", percentBasisPoints: 1000, flatAmount: 0 })).toThrow();
    expect(() => calculateCommission(NaN, { mode: "percent", percentBasisPoints: 1000, flatAmount: 0 })).toThrow();
  });

  it("validates commission input bounds", () => {
    expect(() => normalizeCommissionSettings({ mode: "percent", percentBasisPoints: 12000 })).toThrow();
    expect(() => normalizeCommissionSettings({ mode: "flat", flatAmount: -5 })).toThrow();
    expect(normalizeCommissionSettings({ mode: "percent", percentBasisPoints: 750 })).toEqual({ mode: "percent", percentBasisPoints: 750, flatAmount: 0 });
    expect(normalizeCommissionSettings({ mode: "flat", flatAmount: 900 })).toEqual({ mode: "flat", percentBasisPoints: 0, flatAmount: 900 });
  });
});

describe("vendor tier resolution", () => {
  it("recognizes managed tier names", () => {
    expect(isVendorTier("bronze")).toBe(true);
    expect(isVendorTier("gold")).toBe(true);
    expect(isVendorTier("platinum")).toBe(false);
    expect(isVendorTier(undefined)).toBe(false);
  });

  it("applies the tier override when present", async () => {
    const db = fakeDb({
      platform_settings: () => [{ commissionMode: "percent", commissionRateBasisPoints: 1000, flatCommissionAmount: 0 }],
      users: () => [{ vendorTier: "silver" }],
      commission_tiers: () => [{ mode: "percent", percentBasisPoints: 700, flatAmount: 0 }],
    });
    const result = await resolveEffectiveCommission(db, 42, 10000);
    expect(result.fee).toBe(700);
    expect(result.source).toBe("silver");
    expect(result.vendorTier).toBe("silver");
  });

  it("falls back to the global rate when there is no tier override", async () => {
    const db = fakeDb({
      platform_settings: () => [{ commissionMode: "percent", commissionRateBasisPoints: 1000, flatCommissionAmount: 0 }],
      users: () => [{ vendorTier: "gold" }],
      commission_tiers: () => [],
    });
    const result = await resolveEffectiveCommission(db, 7, 20000);
    expect(result.fee).toBe(2000);
    expect(result.source).toBe("global");
  });
});