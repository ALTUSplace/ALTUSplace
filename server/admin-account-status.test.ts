import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * The admin and super-admin tiers used to compose straight off `t.procedure`,
 * skipping `requireUser` — the only middleware that rejects a non-active
 * `accountStatus`. A banned or suspended admin therefore kept full access,
 * including `admin.updateUserStatus`, which is how the ban could be lifted.
 *
 * These tests are behavioural: they only pass if `requireUser` actually runs on
 * the admin tier. No database is needed — the middleware rejects before any
 * handler body is entered.
 */
type AccountStatus = "active" | "suspended" | "banned";
type UserRole = "admin" | "SUPER_ADMIN";

function context(role: UserRole, accountStatus?: AccountStatus): TrpcContext {
  return {
    user: {
      id: role === "SUPER_ADMIN" ? 99 : 1,
      openId: `${role}-user`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "test",
      role,
      // `undefined` models a row written before the column existed; the server
      // treats a falsy status as "not restricted".
      accountStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("admin tier — accountStatus gate", () => {
  it("rejects a banned admin from the overview", async () => {
    const caller = appRouter.createCaller(context("admin", "banned"));
    await expect(caller.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a suspended admin from the overview", async () => {
    const caller = appRouter.createCaller(context("admin", "suspended"));
    await expect(caller.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a banned super admin from the executive KPIs", async () => {
    const caller = appRouter.createCaller(context("SUPER_ADMIN", "banned"));
    await expect(caller.admin.super.overviewKpis()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a suspended super admin from the moderation queue", async () => {
    const caller = appRouter.createCaller(context("SUPER_ADMIN", "suspended"));
    await expect(caller.admin.super.moderationQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin tier — active accounts are unaffected", () => {
  it("still lets an active admin reach the overview", async () => {
    const caller = appRouter.createCaller(context("admin", "active"));
    const result = await caller.admin.overview();
    expect(result.users).toBeGreaterThanOrEqual(0);
    expect(result.listings).toBeGreaterThanOrEqual(0);
  });

  it("still lets an admin with no stored accountStatus through", async () => {
    const caller = appRouter.createCaller(context("admin"));
    const result = await caller.admin.overview();
    expect(result.users).toBeGreaterThanOrEqual(0);
  });
});

describe("admin tier — anonymous callers", () => {
  it("answers UNAUTHORIZED, not FORBIDDEN, for a caller with no session", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    // Pins the deliberate error-code change: an admin route reached with no
    // cookie is now "log in", not "you are not an admin".
    await expect(caller.admin.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
