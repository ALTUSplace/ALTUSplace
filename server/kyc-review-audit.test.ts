import { vi, beforeEach, describe, expect, it } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import { auditLogs, kycSubmissions, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type RecordedWrite = { table: unknown; values: Record<string, unknown> };
type Projection = Record<string, unknown>;

const ADMIN_ID = 9;
const APPLICANT_ID = 42;
const SUBMISSION_ID = 7;
const REASON = "صور غير واضحة";

/** The pending submission the admin opens in the KYC queue. */
const pendingSubmission = { userId: APPLICANT_ID, status: "Pending" };

/**
 * A drizzle fake that records every write and every projection.
 *
 * `kyc.review` performs exactly one read (the submission lookup), so the fake
 * only has to answer reads of `kycSubmissions`; audit writes are captured on
 * insert and never read back.
 *
 * Rows are narrowed to the requested projection rather than returned whole.
 * That matters: a fake that hands back a full row would let a server query
 * stop asking for a column while the row still carried it, so the value
 * assertions would keep passing while the projection silently rotted.
 */
function makeFakeDb(selectRows: (table: unknown) => unknown[] = () => [pendingSubmission]) {
  const inserts: RecordedWrite[] = [];
  const updates: RecordedWrite[] = [];
  const projections: Projection[] = [];

  const resolved = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });

  /** Keeps only the columns the caller actually selected. */
  const narrow = (row: unknown, projection: Projection) => {
    if (!projection || row === null || typeof row !== "object") return row;
    const source = row as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(projection)) {
      if (key in source) picked[key] = source[key];
    }
    return picked;
  };

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
      chain.then = (resolve: (v: unknown) => void) =>
        resolve(selectRows(table).map((row) => narrow(row, projection ?? {})));
      return chain;
    },
  };

  return { db, inserts, updates, projections };
}

function useDb(fake: ReturnType<typeof makeFakeDb>) {
  vi.mocked(getDb).mockResolvedValue(fake.db as unknown as Awaited<ReturnType<typeof getDb>>);
}

function auditInsert(inserts: RecordedWrite[]) {
  const write = inserts.find((entry) => entry.table === auditLogs);
  if (!write) throw new Error("expected a write to audit_logs, got none");
  return write.values;
}

function tableUpdate(updates: RecordedWrite[], table: unknown) {
  const write = updates.find((entry) => entry.table === table);
  if (!write) throw new Error("expected an update to that table, got none");
  return write.values;
}

function afterData(inserts: RecordedWrite[]) {
  const raw = auditInsert(inserts).afterData;
  if (typeof raw !== "string") throw new Error(`expected serialised afterData, got ${typeof raw}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

function beforeData(inserts: RecordedWrite[]) {
  const raw = auditInsert(inserts).beforeData;
  if (typeof raw !== "string") throw new Error(`expected serialised beforeData, got ${typeof raw}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

function context(role: "owner" | "renter" | "admin" | "SUPER_ADMIN"): TrpcContext {
  return {
    user: {
      id: role === "owner" || role === "renter" ? APPLICANT_ID : ADMIN_ID,
      openId: `kyc-audit-test-${role}`,
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

/** Runs kyc.review as an admin and hands back the recorded writes. */
function review(input: { id?: number; status: "Approved" | "Rejected"; rejectionReason?: string }) {
  const fake = makeFakeDb();
  useDb(fake);
  return appRouter
    .createCaller(context("admin"))
    .kyc.review({ id: SUBMISSION_ID, ...input })
    .then(() => fake);
}

beforeEach(() => {
  vi.mocked(getDb).mockReset();
});

describe("kyc.review writes an audit trail", () => {
  it("records the approval as kyc.approved against the submission", async () => {
    const fake = await review({ status: "Approved" });

    expect(auditInsert(fake.inserts)).toMatchObject({
      actorId: ADMIN_ID,
      action: "kyc.approved",
      entityType: "kyc_submission",
      entityId: SUBMISSION_ID,
    });
  });

  it("records the rejection as kyc.rejected", async () => {
    const fake = await review({ status: "Rejected", rejectionReason: REASON });

    expect(auditInsert(fake.inserts)).toMatchObject({
      actorId: ADMIN_ID,
      action: "kyc.rejected",
      entityType: "kyc_submission",
      entityId: SUBMISSION_ID,
    });
  });

  it("stores the admin's reason in the notes column", async () => {
    const fake = await review({ status: "Rejected", rejectionReason: REASON });

    expect(auditInsert(fake.inserts).notes).toBe(REASON);
  });

  it("stores SQL NULL in notes for an approval", async () => {
    const fake = await review({ status: "Approved" });

    expect(auditInsert(fake.inserts).notes).toBeNull();
  });

  it("identifies the applicant and the resulting verification status", async () => {
    const fake = await review({ status: "Rejected", rejectionReason: REASON });

    expect(afterData(fake.inserts)).toEqual({
      status: "Rejected",
      userId: APPLICANT_ID,
      kycVerificationStatus: "rejected",
    });
  });

  it("captures the prior submission status as beforeData", async () => {
    const fake = await review({ status: "Approved" });

    expect(beforeData(fake.inserts)).toEqual({ status: "Pending" });
  });

  it("asks the database for the prior status it stores as beforeData", async () => {
    // Guards the widened projection: dropping `status` from the select would
    // make beforeData undefined while the assertion above still reads Pending.
    const fake = makeFakeDb();
    useDb(fake);

    await appRouter.createCaller(context("admin")).kyc.review({ id: SUBMISSION_ID, status: "Approved" });

    const projection = fake.projections.find((entry) => "status" in entry);
    expect(projection).toBeDefined();
    expect(Object.keys(projection ?? {})).toContain("userId");
  });
});

describe("kyc.review reason handling", () => {
  it("writes the reason onto the submission row itself", async () => {
    const fake = await review({ status: "Rejected", rejectionReason: REASON });

    expect(tableUpdate(fake.updates, kycSubmissions).rejectionReason).toBe(REASON);
  });

  it("clears any earlier rejection reason on approval", async () => {
    const fake = await review({ status: "Approved" });

    expect(tableUpdate(fake.updates, kycSubmissions).rejectionReason).toBeNull();
  });

  it("accepts a reason at the 500-character limit", async () => {
    const reason = "ا".repeat(500);
    const fake = await review({ status: "Rejected", rejectionReason: reason });

    expect(auditInsert(fake.inserts).notes).toBe(reason);
  });

  it("refuses a rejection whose reason is only whitespace", async () => {
    const fake = makeFakeDb();
    useDb(fake);

    await expect(
      appRouter.createCaller(context("admin")).kyc.review({ id: SUBMISSION_ID, status: "Rejected", rejectionReason: "   " }),
    ).rejects.toThrow();
    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("refuses a rejection with no reason at all", async () => {
    // The old fallback stored "لم يتم تقديم سبب." for this case, so the audit
    // trail could carry a fabricated reason. There is deliberately no
    // "placeholder is absent" assertion elsewhere: .refine() makes that branch
    // unreachable, and a test that cannot fail would only inflate the count.
    // The guarantee is pinned here, behaviourally, instead.
    const fake = makeFakeDb();
    useDb(fake);

    await expect(
      appRouter.createCaller(context("admin")).kyc.review({ id: SUBMISSION_ID, status: "Rejected" }),
    ).rejects.toThrow();
    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("refuses an over-long reason before writing anything", async () => {
    const fake = makeFakeDb();
    useDb(fake);

    await expect(
      appRouter.createCaller(context("admin")).kyc.review({ id: SUBMISSION_ID, status: "Rejected", rejectionReason: "ا".repeat(501) }),
    ).rejects.toThrow();
    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("does not require a reason in order to approve", async () => {
    const fake = await review({ status: "Approved" });

    expect(auditInsert(fake.inserts).action).toBe("kyc.approved");
  });
});

describe("kyc.review keeps the applicant account in step", () => {
  it("marks the applicant verified on approval", async () => {
    const fake = await review({ status: "Approved" });

    expect(tableUpdate(fake.updates, users).kycVerificationStatus).toBe("verified");
  });

  it("stamps kycVerifiedAt on approval", async () => {
    const fake = await review({ status: "Approved" });

    expect(tableUpdate(fake.updates, users).kycVerifiedAt).toBeInstanceOf(Date);
  });

  it("marks the applicant rejected on rejection", async () => {
    const fake = await review({ status: "Rejected", rejectionReason: REASON });

    expect(tableUpdate(fake.updates, users).kycVerificationStatus).toBe("rejected");
  });

  it("does not stamp kycVerifiedAt on rejection", async () => {
    const fake = await review({ status: "Rejected", rejectionReason: REASON });

    expect(tableUpdate(fake.updates, users).kycVerifiedAt).toBeUndefined();
  });
});

describe("kyc.review refuses to fabricate a success", () => {
  it("throws NOT_FOUND for a submission that does not exist", async () => {
    const fake = makeFakeDb(() => []);
    useDb(fake);

    await expect(
      appRouter.createCaller(context("admin")).kyc.review({ id: SUBMISSION_ID, status: "Approved" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("rejects a non-admin caller and writes nothing", async () => {
    for (const role of ["owner", "renter"] as const) {
      const fake = makeFakeDb();
      useDb(fake);

      await expect(
        appRouter.createCaller(context(role)).kyc.review({ id: SUBMISSION_ID, status: "Approved" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fake.inserts).toHaveLength(0);
      expect(fake.updates).toHaveLength(0);
    }
  });
});