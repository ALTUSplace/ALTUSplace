import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { UNAUTHED_ERR_MSG } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const baseUser: AuthenticatedUser = {
  id: 7,
  openId: "comment-test-user",
  email: "commenter@example.com",
  name: "Commenter",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createCtx(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("comments router", () => {
  it("listByListing returns an empty thread shape when the database is unavailable", async () => {
    // Test env has no DATABASE_URL -> getDb() returns null -> handlers degrade.
    const caller = appRouter.createCaller(createCtx(null));
    const result = await caller.comments.listByListing({ listingId: 42, limit: 20 });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("listByListing rejects invalid inputs (non-positive listing id)", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(caller.comments.listByListing({ listingId: 0 })).rejects.toThrow();
  });

  it("create requires an authenticated user", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(
      caller.comments.create({ listingId: 42, body: "سؤال عن التوفر" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  });

  it("create rejects an empty body via zod before hitting the database", async () => {
    const caller = appRouter.createCaller(createCtx(baseUser));
    await expect(caller.comments.create({ listingId: 42, body: "   " })).rejects.toThrow();
  });

  it("create fails gracefully (INTERNAL_SERVER_ERROR) when the database is unavailable", async () => {
    const caller = appRouter.createCaller(createCtx(baseUser));
    await expect(caller.comments.create({ listingId: 42, body: "مرحباً!" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("remove requires an authenticated user", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(caller.comments.remove({ commentId: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("remove fails gracefully when the database is unavailable", async () => {
    const caller = appRouter.createCaller(createCtx(baseUser));
    await expect(caller.comments.remove({ commentId: 1 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("exposes listByListing / create / remove procedures", () => {
    const caller = appRouter.createCaller(createCtx(baseUser));
    expect(typeof caller.comments.listByListing).toBe("function");
    expect(typeof caller.comments.create).toBe("function");
    expect(typeof caller.comments.remove).toBe("function");
  });
});