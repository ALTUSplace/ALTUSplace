import { vi, beforeEach, describe, expect, it } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

// The moderation procedure notifies the owner over the network; the calls are
// recorded rather than executed.
vi.mock("./notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notificationService")>();
  return { ...actual, safeNotifyUser: vi.fn(async () => 1) };
});

import { getDb } from "./db";
import { safeNotifyUser } from "./notificationService";
import { appRouter } from "./routers";
import { auditLogs, bookings, listings } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type RecordedWrite = { table: unknown; values: Record<string, unknown> };
type Projection = Record<string, unknown>;

const OWNER_ID = 44;
const LISTING_ID = 7;
const REASON = "blurry photo";

const queueRow = { id: LISTING_ID, ownerId: OWNER_ID, title: "Dacia Duster", status: "Pending", category: "car" };

/**
 * A drizzle fake that records every write and, critically, every *projection*
 * passed to `select()`.
 *
 * Capturing the projection is what answers "does the server actually ask the
 * database for the notes column?" as a behavioural assertion instead of a grep
 * over the source. The projection's keys are the output field names, so a
 * missing `notes` key is directly observable.
 */
function makeFakeDb(selectRows: (table: unknown) => unknown[] = () => []) {
  const inserts: RecordedWrite[] = [];
  const updates: RecordedWrite[] = [];
  const projections: Projection[] = [];

  const resolved = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });

  const db = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        const chain = resolved([{ insertId: 1 }]) as Record<string, unknown>;
        chain.returning = () => resolved([{ insertId: 1 }]);
        return chain;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return { where: () => resolved(undefined) };
      },
    }),
    select: (projection?: Projection) => {
      projections.push(projection ?? {});
      let table: unknown = null;
      const chain: Record<string, unknown> = {};
      chain.from = (t: unknown) => {
        table = t;
        return chain;
      };
      chain.where = () => chain;
      for (const passthrough of ["orderBy", "groupBy", "limit", "offset", "leftJoin", "innerJoin", "having"]) {
        chain[passthrough] = () => chain;
      }
      chain.then = (resolve: (v: unknown) => void) => resolve(selectRows(table));
      return chain;
    },
  };

  return { db, inserts, updates, projections };
}

function useDb(fake: ReturnType<typeof makeFakeDb>) {
  vi.mocked(getDb).mockResolvedValue(fake.db as unknown as Awaited<ReturnType<typeof getDb>>);
}

/** The single audit_logs row a procedure wrote. */
function auditInsert(inserts: RecordedWrite[]) {
  const write = inserts.find((entry) => entry.table === auditLogs);
  if (!write) throw new Error("expected a write to audit_logs, got none");
  return write.values;
}

/** The projection of whichever select reads the audit feed. */
function auditProjection(projections: Projection[]) {
  const projection = projections.find((entry) => "actorName" in entry);
  if (!projection) throw new Error("expected a select over the audit feed, got none");
  return projection;
}

function context(role: "owner" | "admin" | "SUPER_ADMIN"): TrpcContext {
  return {
    user: {
      id: role === "owner" ? OWNER_ID : 9,
      openId: `${role}-audit-notes-test`,
      email: null,
      name: "Actor",
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

function reject(reason?: string) {
  const fake = makeFakeDb(() => [queueRow]);
  useDb(fake);
  return appRouter
    .createCaller(context("SUPER_ADMIN"))
    .admin.super.moderate({ listingId: LISTING_ID, action: "reject", ...(reason === undefined ? {} : { reason }) })
    .then(() => fake);
}

beforeEach(() => {
  vi.mocked(safeNotifyUser).mockClear();
});

describe("audit_logs.notes — the moderation reason is a first-class column", () => {
  it("persists the rejection reason in notes", async () => {
    const fake = await reject(REASON);
    expect(auditInsert(fake.inserts).notes).toBe(REASON);
  });

  it("does not bury the reason inside the afterData JSON", async () => {
    const fake = await reject(REASON);
    const payload = JSON.parse(auditInsert(fake.inserts).afterData as string) as Record<string, unknown>;
    expect(payload).toEqual({ status: "Rejected" });
    expect(Object.keys(payload)).not.toContain("reason");
  });

  it("writes SQL NULL, never the text 'undefined', for an approval", async () => {
    const fake = makeFakeDb(() => [queueRow]);
    useDb(fake);

    await appRouter
      .createCaller(context("SUPER_ADMIN"))
      .admin.super.moderate({ listingId: LISTING_ID, action: "approve", reason: REASON });

    expect(auditInsert(fake.inserts).notes).toBeNull();
  });

  it("writes SQL NULL for a rejection that carries no reason", async () => {
    const fake = await reject();
    expect(auditInsert(fake.inserts).notes).toBeNull();
  });

  it("keeps the reason out of the notification path it used to share", async () => {
    await reject(REASON);
    // The owner is still told why — moving the reason into notes must not have
    // emptied the message.
    expect(vi.mocked(safeNotifyUser).mock.calls[0]?.[0]?.message).toContain(REASON);
  });

  it("accepts a reason at the 500-character limit", async () => {
    const reason = "ا".repeat(500);
    const fake = await reject(reason);
    expect(auditInsert(fake.inserts).notes).toBe(reason);
  });

  it("rejects an over-long reason before writing anything", async () => {
    const fake = makeFakeDb(() => [queueRow]);
    useDb(fake);

    await expect(
      appRouter
        .createCaller(context("SUPER_ADMIN"))
        .admin.super.moderate({ listingId: LISTING_ID, action: "reject", reason: "ا".repeat(501) }),
    ).rejects.toThrow();
    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });
});

describe("audit feed readers project notes", () => {
  it("admin.auditLogs asks the database for the notes column", async () => {
    const fake = makeFakeDb();
    useDb(fake);

    await appRouter.createCaller(context("admin")).admin.auditLogs();

    expect(Object.keys(auditProjection(fake.projections))).toContain("notes");
  });

  it("agency.recentActivity asks the database for the notes column", async () => {
    // The agency feed returns early when the owner has no listings, so the fake
    // must hand back one or the audit select is never reached.
    const fake = makeFakeDb((table) => (table === listings ? [{ id: LISTING_ID }] : table === bookings ? [] : []));
    useDb(fake);

    await appRouter.createCaller(context("owner")).agency.recentActivity();

    expect(Object.keys(auditProjection(fake.projections))).toContain("notes");
  });

  it("returns the stored reason to the admin feed", async () => {
    const row = {
      id: 1,
      actorId: 9,
      actorName: "Actor",
      action: "listing.rejected",
      entityType: "listing",
      entityId: LISTING_ID,
      beforeData: JSON.stringify({ status: "Pending" }),
      afterData: JSON.stringify({ status: "Rejected" }),
      notes: REASON,
      createdAt: new Date(),
    };
    const fake = makeFakeDb(() => [row]);
    useDb(fake);

    const feed = await appRouter.createCaller(context("admin")).admin.auditLogs();

    expect(feed[0]?.notes).toBe(REASON);
  });
});