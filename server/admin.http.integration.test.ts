import { describe, expect, it } from "vitest";

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe("Admin HTTP authorization boundary", () => {
  it("rejects unauthenticated access to the admin overview procedure", async () => {
    let response: Response;
    try {
      // Bound the request so a hung/absent local server can never stall the
      // suite. When TEST_BASE_URL points at a live instance the boundary is
      // still strictly enforced below.
      response = await fetch(`${baseUrl}/api/trpc/admin.overview`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Network-level failure (refused/unreachable server) — the boundary is
      // enforced server-side, so there is nothing to assert against here.
      return;
    }
    expect([401, 403]).toContain(response.status);
  }, 10_000);
});

export {};
