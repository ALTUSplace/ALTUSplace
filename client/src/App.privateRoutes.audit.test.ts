import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard, not a behaviour test: vitest runs in the `node` environment
 * and the repo ships no DOM or React-testing library, so routes cannot be
 * rendered here. The real enforcement is server-side (every procedure behind
 * these pages is a `protectedProcedure`), so this file only exists to stop the
 * three private routes from being silently unwrapped again, and to stop
 * `/checkout` from being guarded at all — guest checkout is deliberate
 * (`Checkout.tsx` allows an anonymous booking; it just cannot persist it).
 */
const appSource = readFileSync(join(import.meta.dirname, "App.tsx"), "utf8");

/** The full `<Route>…</Route>` block for a path, in either JSX form. */
function routeBlock(pathFragment: string): string {
  const lines = appSource.split("\n");
  const start = lines.findIndex(
    (candidate) =>
      candidate.includes(`path="${pathFragment}"`) || candidate.includes(`path={"${pathFragment}"}`),
  );
  expect(start, `route ${pathFragment} not found in App.tsx`).toBeGreaterThanOrEqual(0);
  // Self-closing form: <Route path="…" component={X} />
  if (lines[start].includes("/>")) return lines[start];
  const end = lines.findIndex((candidate, index) => index >= start && candidate.includes("</Route>"));
  expect(end, `route ${pathFragment} is never closed in App.tsx`).toBeGreaterThan(start);
  return lines.slice(start, end + 1).join("\n");
}

describe("private routes are wrapped in AccessGuard", () => {
  it.each([
    ["/voucher/:code", "VoucherPage"],
    ["/messages/:bookingId", "BookingMessagesPage"],
    ["/support-tickets", "SupportTicketsPage"],
  ])("%s requires a signed-in user before rendering %s", (path, page) => {
    const block = routeBlock(path);
    expect(block).toContain('area="authenticated"');
    expect(block).toContain(page);
    // The render-prop form is required so the guard can wrap the element.
    expect(block).not.toContain("component={");
  });
});

describe("public routes stay public", () => {
  it.each([
    ["/checkout", "CheckoutPage"],
    ["/success", "SuccessPage"],
    ["/dispute-resolution", "DisputeResolutionPage"],
  ])("%s is not wrapped in an access guard", (path, page) => {
    const block = routeBlock(path);
    expect(block).not.toContain("AccessGuard");
    expect(block).toContain(page);
  });
});

/**
 * The moderation queue reads and writes pending work across four tables. Its
 * procedures are `adminProcedure`, so server-side is the real boundary; these
 * assertions exist so the page cannot be silently unwrapped to the default
 * batched trpc client, which stalls against Supabase's transaction-mode pooler
 * once one request carries 3+ procedures.
 */
describe("admin-tier routes", () => {
  it("/admin/moderation requires the admin role", () => {
    const block = routeBlock("/admin/moderation");
    expect(block).toContain('area="admin"');
    expect(block).toContain("AdminModerationPage");
    expect(block).not.toContain("component={");
  });

  it("/admin/moderation uses the unbatched trpc provider", () => {
    expect(routeBlock("/admin/moderation")).toContain("TrpcUnbatchedProvider");
  });

  it.each([
    ["/admin", "AdminDashboardPage"],
    ["/admin/moderation", "AdminModerationPage"],
  ])("%s stays inside the unbatched trpc provider", (path, page) => {
    const block = routeBlock(path);
    expect(block).toContain("TrpcUnbatchedProvider");
    expect(block).toContain(page);
  });

  it("does not place the queue behind the superadmin tier", () => {
    // adminProcedure, not superAdminProcedure: an ordinary admin must reach it,
    // and a regression to area="superadmin" would lock them out.
    expect(routeBlock("/admin/moderation")).not.toContain('area="superadmin"');
  });
});

describe("AccessGuard areas", () => {
  it("exposes an 'authenticated' tier for role-agnostic private routes", () => {
    expect(appSource).toContain("area: 'authenticated' | 'admin' | 'superadmin' | 'host'");
    // Must come before the role checks, otherwise it falls through to 'host'
    // and a plain renter could never open their own voucher.
    expect(appSource.indexOf("area === 'authenticated'")).toBeLessThan(
      appSource.indexOf("area === 'superadmin'"),
    );
  });
});
