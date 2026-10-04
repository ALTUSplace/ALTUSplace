import { vi, beforeEach, describe, expect, it } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

// The moderation flow's correctness depends on the *wording* and dedupe key of
// the notification it sends (a "published" notification for a Pending listing is
// a lie), so the calls are recorded rather than executed. Running the real
// service would also attempt an outbound email from the test process.
vi.mock("./notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notificationService")>();
  return {
    ...actual,
    safeNotifyUser: vi.fn(async () => 1),
    alertAdmins: vi.fn(async () => undefined),
  };
});

import { getDb } from "./db";
import { safeNotifyUser, alertAdmins } from "./notificationService";
import { createImageVerificationProof } from "./imageVerification";
import { appRouter } from "./routers";
import { listings } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type Predicate = { column: string; value: unknown };

/**
 * Extract every `column = value` comparison from a drizzle `where` clause.
 *
 * This is what lets the fake db tell `where(status = 'Pending')` apart from
 * `where(status = 'Published')` — the exact confusion that made
 * `admin.overview.pendingListings` report the wrong number. Only `queryChunks`
 * is ever descended, so the table <-> column reference cycle is never followed.
 */
function readPredicates(clause: unknown): Predicate[] {
  const found: Predicate[] = [];

  const scan = (chunks: unknown[]) => {
    for (let i = 0; i < chunks.length; i++) {
      const node = chunks[i] as Record<string, unknown> | undefined;
      if (!node || typeof node !== "object") continue;

      // A nested comparison, e.g. one operand of and()/or().
      if (Array.isArray(node.queryChunks)) {
        scan(node.queryChunks as unknown[]);
        continue;
      }

      const ctor = (node.constructor as { name?: string } | undefined)?.name ?? "";
      if (!ctor.endsWith("Column")) continue;

      // eq() emits [StringChunk, Column, StringChunk, Param, StringChunk].
      const param = chunks[i + 2] as Record<string, unknown> | undefined;
      const paramCtor = (param?.constructor as { name?: string } | undefined)?.name;
      if (paramCtor === "Param") found.push({ column: String(node.name), value: param?.value });
    }
  };

  const chunks = (clause as { queryChunks?: unknown } | null | undefined)?.queryChunks;
  if (Array.isArray(chunks)) scan(chunks);
  return found;
}

type SelectHandler = (table: unknown, predicates: Predicate[]) => unknown[];
type RecordedWrite = { table: unknown; values: Record<string, unknown> };

const INSERT_ID = 4242;

const nothing = () => [];

/**
 * Minimal drizzle fake that records every write and lets the caller key read
 * results off the table plus the decoded `where` predicates.
 */
function makeFakeDb(selectRows: SelectHandler) {
  const inserts: RecordedWrite[] = [];
  const updates: RecordedWrite[] = [];

  const resolved = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });

  const db = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        const chain = resolved([{ insertId: INSERT_ID }]) as Record<string, unknown>;
        chain.returning = () => resolved([{ insertId: INSERT_ID }]);
        return chain;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return { where: () => resolved(undefined) };
      },
    }),
    select: () => {
      let table: unknown = null;
      let predicates: Predicate[] = [];
      const chain: Record<string, unknown> = {};
      chain.from = (t: unknown) => {
        table = t;
        return chain;
      };
      chain.where = (clause?: unknown) => {
        predicates = readPredicates(clause);
        return chain;
      };
      for (const passthrough of ["orderBy", "groupBy", "limit", "offset", "leftJoin", "innerJoin", "having"]) {
        chain[passthrough] = () => chain;
      }
      chain.then = (resolve: (v: unknown) => void) => resolve(selectRows(table, predicates));
      return chain;
    },
  };

  return { db, inserts, updates };
}

function useDb(fake: ReturnType<typeof makeFakeDb>) {
  vi.mocked(getDb).mockResolvedValue(fake.db as unknown as Awaited<ReturnType<typeof getDb>>);
}

const OWNER_ID = 44;
const LISTING_ID = 7;
const IMAGE_URL = "https://example.com/duster.jpg";

function context(role: "owner" | "admin" | "SUPER_ADMIN"): TrpcContext {
  return {
    user: {
      id: OWNER_ID,
      openId: `${role}-moderation-flow-test`,
      // null keeps listings.create off the email branch, so no test can reach
      // the notification provider.
      email: null,
      name: "Owner",
      loginMethod: "test",
      role,
      accountStatus: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const createInput = {
  title: "Dacia Duster",
  category: "car",
  pricePerDay: 400,
  imageUrl: IMAGE_URL,
  imageVerificationProof: createImageVerificationProof({
    ownerId: OWNER_ID,
    url: IMAGE_URL,
    bytes: Buffer.from("duster-image-bytes"),
  }),
  city: "Casablanca",
};

const queueRow = {
  id: LISTING_ID,
  ownerId: OWNER_ID,
  title: "Dacia Duster",
  status: "Pending",
  category: "car",
};

/** The single listings write a procedure performed, ignoring audit-log inserts. */
function listingUpdate(updates: RecordedWrite[]) {
  const write = updates.find((entry) => entry.table === listings);
  if (!write) throw new Error("expected a write to listings, got none");
  return write.values;
}

beforeEach(() => {
  vi.mocked(safeNotifyUser).mockClear();
  vi.mocked(alertAdmins).mockClear();
});

describe("moderation flow — listings are reviewed before they are public", () => {
  it("creates a new listing as Pending, not Published", async () => {
    const fake = makeFakeDb(nothing);
    useDb(fake);

    await appRouter.createCaller(context("owner")).listings.create(createInput);

    const inserted = fake.inserts.find((entry) => entry.table === listings);
    expect(inserted).toBeDefined();
    expect(inserted?.values.status).toBe("Pending");
  });

  it("tells the vendor the listing is awaiting review instead of claiming it is live", async () => {
    const fake = makeFakeDb(nothing);
    useDb(fake);

    await appRouter.createCaller(context("owner")).listings.create(createInput);

    expect(safeNotifyUser).toHaveBeenCalledTimes(1);
    const notice = vi.mocked(safeNotifyUser).mock.calls[0]![0];
    // A Pending listing must never be announced as approved/published: the type
    // and the dedupe key are what the real approval notification later reuses.
    expect(notice.type).toBe("system");
    expect(notice.dedupeKey).toBe(`listing-submitted:${OWNER_ID}:${INSERT_ID}`);
    expect(notice.message).not.toMatch(/تم نشر|est publiée/);
    expect(alertAdmins).toHaveBeenCalledTimes(1);
  });

  it("moves an approved listing to Approved", async () => {
    const fake = makeFakeDb(() => [queueRow]);
    useDb(fake);

    const result = await appRouter
      .createCaller(context("SUPER_ADMIN"))
      .admin.super.moderate({ listingId: LISTING_ID, action: "approve" });

    expect(result).toEqual({ success: true, status: "Approved" });
    expect(listingUpdate(fake.updates).status).toBe("Approved");
  });

  it("moves a rejected listing to Rejected", async () => {
    const fake = makeFakeDb(() => [queueRow]);
    useDb(fake);

    const result = await appRouter
      .createCaller(context("SUPER_ADMIN"))
      .admin.super.moderate({ listingId: LISTING_ID, action: "reject", reason: "blurry photo" });

    expect(result).toEqual({ success: true, status: "Rejected" });
    expect(listingUpdate(fake.updates).status).toBe("Rejected");
  });

  it("publishes a listing when an admin explicitly sets Published", async () => {
    const fake = makeFakeDb(() => [{ status: "Pending", isFeatured: false }]);
    useDb(fake);

    await appRouter.createCaller(context("admin")).admin.moderateListing({
      listingId: LISTING_ID,
      status: "Published",
    });

    expect(listingUpdate(fake.updates).status).toBe("Published");
  });

  it("lets a super admin reject an Approved listing, while the moderation queue still cannot publish it", async () => {
    // `Approved` sits outside the 409 blocklist at the top of `moderate`, so an
    // admin can pull a listing that was approved and later found non-compliant.
    // The blast radius is bounded: `moderate` only ever writes Approved or
    // Rejected, so re-moderating can never silently publish. Reaching
    // `Published` requires the separate explicit `admin.moderateListing` call.
    const approvedRow = { ...queueRow, status: "Approved" };

    const rejecting = makeFakeDb(() => [approvedRow]);
    useDb(rejecting);
    const rejected = await appRouter
      .createCaller(context("SUPER_ADMIN"))
      .admin.super.moderate({ listingId: LISTING_ID, action: "reject", reason: "misleading photos" });

    expect(rejected).toEqual({ success: true, status: "Rejected" });
    expect(listingUpdate(rejecting.updates).status).toBe("Rejected");

    const approving = makeFakeDb(() => [approvedRow]);
    useDb(approving);
    const reapproved = await appRouter
      .createCaller(context("SUPER_ADMIN"))
      .admin.super.moderate({ listingId: LISTING_ID, action: "approve" });

    expect(reapproved).toEqual({ success: true, status: "Approved" });
    expect(listingUpdate(approving.updates).status).toBe("Approved");
    expect(listingUpdate(approving.updates).status).not.toBe("Published");
  });

  it("keeps a Pending listing Pending when its owner edits it, so an edit cannot skip review", async () => {
    const fake = makeFakeDb(() => [
      { id: LISTING_ID, imageUrl: IMAGE_URL, status: "Pending", pricePerDay: 400 },
    ]);
    useDb(fake);

    // Only the title changes, so the image-proof re-verification is not entered.
    const result = await appRouter
      .createCaller(context("owner"))
      .listings.update({ id: LISTING_ID, title: "Dacia Duster 2021" });

    expect(result.status).toBe("Pending");
    expect(listingUpdate(fake.updates).status).toBe("Pending");
  });

  it("counts Pending listings in the admin overview, not every Published one", async () => {
    // Distinct sentinels per query shape: if the pending query stops filtering
    // on 'Pending' it falls through to the other-status branch and returns 3,
    // which fails the assertion below instead of silently passing.
    const PENDING_COUNT = 7;
    const OTHER_STATUS_COUNT = 3;
    const TOTAL_LISTINGS = 99;

    const fake = makeFakeDb((table, predicates) => {
      if (table !== listings) return [];
      if (predicates.some((p) => p.column === "status" && p.value === "Pending")) {
        return [{ value: PENDING_COUNT }];
      }
      if (predicates.some((p) => p.column === "status")) return [{ value: OTHER_STATUS_COUNT }];
      return [{ value: TOTAL_LISTINGS }];
    });
    useDb(fake);

    const result = await appRouter.createCaller(context("admin")).admin.overview();

    expect(result.pendingListings).toBe(PENDING_COUNT);
    expect(result.listings).toBe(TOTAL_LISTINGS);
  });
});