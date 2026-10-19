import { describe, expect, it } from "vitest";
import { isPaytabsPaidStatus } from "./webhooks";

// L-7: the PayTabs webhook is fail-closed. A callback that cannot present an
// explicit success status (missing/empty field) must settle as FAILED.
describe("PayTabs status parsing (fail-closed)", () => {
  it("treats a missing or empty status as failed", () => {
    expect(isPaytabsPaidStatus(undefined)).toBe(false);
    expect(isPaytabsPaidStatus(null)).toBe(false);
    expect(isPaytabsPaidStatus("")).toBe(false);
  });

  it("accepts only the explicit success statuses", () => {
    for (const code of ["success", "PAID", "settled", "Authorised", "approved", "1"]) {
      expect(isPaytabsPaidStatus(code)).toBe(true);
    }
  });

  it("treats any other status as failed", () => {
    for (const code of ["Failed", "declined", "pending", "cancelled", "0"]) {
      expect(isPaytabsPaidStatus(code)).toBe(false);
    }
  });
});
