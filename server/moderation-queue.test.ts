import { vi, beforeEach, describe, expect, it } from "vitest";
import { asc, count, desc, eq } from "drizzle-orm";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import { listings, partnerApplications, refundRequests, kycSubmissions } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type Projection = Record<string, unknown>;
type Kind = "listing" | "kyc" | "partner" | "refund";

const ADMIN_ID = 9;

/** One read the procedure issued, with everything needed to audit it. */
type Read = {
  table: unknown;
  projection: Projection;
  whereParams: unknown[];
  orderText: string;
  limit: number | null;
  joined: unknown[];
};

type Seed = Partial<Record<Kind, Record<string, unknown>[]>>;
type Counts = Partial<Record<Kind, number>>;

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

/**
 * Pending rows shaped like the procedure's PROJECTION, not like the table.
 *
 * Three deliberate differences from a real table row:
 *
 *  - Columns the queue does not project are still present (`passwordHash`,
 *    `description`, `providerSessionId`). Narrowing must drop them, so their
 *    absence from the response is a real assertion rather than a tautology.
 *  - Joined `users.name` values (`ownerName`, `userName`, `requesterName`) are
 *    baked in. The fake has no `users` table to join against.
 *  - The timestamp is always under `submittedAt`, matching the alias the
 *    procedure projects for all four kinds (for listings it aliases
 *    `listings.createdAt`).
 */
function seedRows(seed: Seed): Seed {
  return seed;
}

/**
 * A drizzle fake for a read-only procedure.
 *
 * Differences from the PR-4 fake in `kyc-review-audit.test.ts`, both forced by
 * this procedure's shape:
 *
 *  - It must answer EIGHT reads per call (four `count()` aggregates and four
 *    capped row reads), and distinguish them. The discriminator is the
 *    projection: `count()` reads ask for exactly `{ value }`, row reads ask for
 *    many named columns. There is no other reliable signal, so this is asserted
 *    in a test below rather than assumed.
 *  - It must SIMULATE `orderBy` and `limit`, because FIFO correctness depends on
 *    the per-query cap keeping the oldest rows. `moderationQueue` orders each
 *    per-kind query, caps it at `limit`, merges, re-sorts, then caps again. If
 *    the fake ignored the order direction it would hand back every row in seed
 *    order and the "oldest survive the cap" test could not fail. Inferring the
 *    direction from the recorded SQL is what makes that test meaningful: change
 *    `asc` to `desc` in the procedure and this fake reproduces the resulting
 *    starvation.
 *
 * Rows are narrowed to the requested projection, as in PR-4.
 */
function makeFakeDb(options: { seed?: Seed; counts?: Counts } = {}) {
  const seed = options.seed ?? {};
  const reads: Read[] = [];

  const tableToKind = (table: unknown): Kind | null => {
    if (table === listings) return "listing";
    if (table === kycSubmissions) return "kyc";
    if (table === partnerApplications) return "partner";
    if (table === refundRequests) return "refund";
    return null;
  };

  const isCountProjection = (projection: Projection) =>
    Object.keys(projection).length === 1 && "value" in projection;

  const narrow = (row: unknown, projection: Projection) => {
    if (row === null || typeof row !== "object") return row;
    const source = row as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(projection)) if (key in source) picked[key] = source[key];
    return picked;
  };

  const resolved = (value: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(value) });

  const db = {
    select: (projection?: Projection) => {
      const read: Read = {
        table: null,
        projection: projection ?? {},
        whereParams: [],
        orderText: "",
        limit: null,
        joined: [],
      };
      reads.push(read);
      const chain: Record<string, unknown> = {};
      chain.from = (t: unknown) => {
        read.table = t;
        return chain;
      };
      chain.where = (clause: unknown) => {
        read.whereParams = sqlShape(clause).params;
        return chain;
      };
      chain.leftJoin = (...tables: unknown[]) => {
        read.joined.push(...tables);
        return chain;
      };
      chain.orderBy = (clause: unknown) => {
        read.orderText = sqlShape(clause).text;
        return chain;
      };
      chain.limit = (n: number) => {
        read.limit = n;
        return chain;
      };
      for (const passthrough of ["groupBy", "offset", "innerJoin", "having"]) {
        chain[passthrough] = () => chain;
      }
      chain.then = (resolve: (v: unknown) => void) => {
        const kind = tableToKind(read.table);
        const rows = (kind ? seed[kind] : undefined) ?? [];
        if (isCountProjection(read.projection)) {
          // A count is over the whole pending set, never over the returned page.
          const reported = kind ? options.counts?.[kind] : undefined;
          resolve([{ value: reported ?? rows.length }]);
          return;
        }
        const ascending = read.orderText.toLowerCase().includes("asc");
        const ordered = [...rows].sort((a, b) => {
          const left = new Date(a.submittedAt as string).getTime();
          const right = new Date(b.submittedAt as string).getTime();
          return ascending ? left - right : right - left;
        });
        const capped = read.limit == null ? ordered : ordered.slice(0, read.limit);
        resolve(capped.map((row) => narrow(row, read.projection)));
      };
      return chain;
    },
  };

  return { db, reads };
}

/**
 * Extracts the bound parameters and referenced identifiers out of a drizzle SQL
 * object.
 *
 * Read-only introspection of the clause objects the procedure hands the fake, so
 * a test can assert WHICH status literal was filtered on and WHICH direction a
 * query was ordered in. Both are load-bearing and neither is observable from the
 * returned values alone:
 *
 *  - `partnerApplications.status` is lowercase `'pending'` while the other three
 *    are capitalised `'Pending'`. A wrong-case literal would filter nothing and
 *    the queue would silently read as permanently empty.
 *  - The FIFO property depends on `asc`, and every returned row is re-sorted by
 *    the procedure anyway, so only the recorded clause reveals it.
 *
 * The clause is a tree, not a flat list: `queryChunks` holds `StringChunk`
 * objects (the operators and direction words), column objects, `Param` objects
 * (the bound literals) and nested `SQL` nodes. A walker that forgets to recurse
 * into arrays silently returns nothing, which is why there is a self-check test
 * below: if drizzle's internals shift, it fails loudly here instead of letting
 * every status and direction assertion pass vacuously.
 */
function sqlShape(clause: unknown): { params: unknown[]; text: string } {
  const params: unknown[] = [];
  const words: string[] = [];
  const seen = new Set<unknown>();

  const ctorName = (node: unknown) =>
    (node as { constructor?: { name?: string } } | null)?.constructor?.name;

  const walk = (node: unknown, depth: number) => {
    if (node === null || node === undefined || depth > 12) return;
    if (typeof node === "string") {
      words.push(node);
      return;
    }
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const name = ctorName(node);
    if (name === "Param") {
      params.push(record.value);
      return;
    }
    if (name === "StringChunk") {
      words.push(String(record.value));
      return;
    }
    // Column class names are not uniform across kinds -- PgTimestamp,
    // PgInteger, PgVarchar, PgEnumColumn -- so identify a column structurally
    // (it carries a name and a table reference) rather than by class name.
    if (typeof record.name === "string" && record.table !== undefined) {
      words.push(record.name);
      return;
    }
    walk(record.queryChunks, depth + 1);
  };

  walk((clause as { queryChunks?: unknown } | null)?.queryChunks, 0);
  return { params, text: words.join(" ") };
}

function useDb(fake: ReturnType<typeof makeFakeDb>) {
  vi.mocked(getDb).mockResolvedValue(fake.db as unknown as Awaited<ReturnType<typeof getDb>>);
}

function context(role: "renter" | "owner" | "admin" | "SUPER_ADMIN"): TrpcContext {
  return {
    user: {
      id: role === "admin" || role === "SUPER_ADMIN" ? ADMIN_ID : 42,
      openId: `moderation-queue-test-${role}`,
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

type QueueInput = { kinds?: Kind[]; limit?: number };

async function run(
  options: { seed?: Seed; counts?: Counts } = {},
  input: QueueInput = {},
  role: "renter" | "owner" | "admin" | "SUPER_ADMIN" = "admin",
) {
  const fake = makeFakeDb(options);
  useDb(fake);
  const result = await appRouter.createCaller(context(role)).admin.moderationQueue(input);
  return { fake, result };
}

const rowReads = (reads: Read[]) => reads.filter((read) => Object.keys(read.projection).length !== 1);
const countReads = (reads: Read[]) => reads.filter((read) => Object.keys(read.projection).length === 1);

beforeEach(() => {
  vi.mocked(getDb).mockReset();
});

describe("sqlShape (self-check on the fake's introspection)", () => {
  it("reads the bound literal out of an eq() clause", () => {
    expect(sqlShape(eq(listings.status, "Pending")).params).toEqual(["Pending"]);
  });

  it("reads a lowercase enum literal just the same", () => {
    // The four status enums disagree on casing, and a wrong-case literal filters
    // nothing at all while looking perfectly plausible in review.
    expect(sqlShape(eq(partnerApplications.status, "pending")).params).toEqual(["pending"]);
  });

  it("reads the direction and the column out of an orderBy clause", () => {
    // Without the direction this fake would treat every ordering as ascending
    // and the FIFO test below could never fail.
    const ascending = sqlShape(asc(listings.createdAt)).text.toLowerCase();
    const descending = sqlShape(desc(listings.createdAt)).text.toLowerCase();

    expect(ascending).toContain("asc");
    expect(ascending).not.toContain("desc");
    expect(ascending).toContain("createdat");
    expect(descending).toContain("desc");
    expect(descending).not.toContain("asc");
  });
});

describe("admin.moderationQueue when the database is unreachable", () => {
  it("returns zeroed counts alongside an empty list rather than a bare []", async () => {
    // The distinction matters: `[]` alone renders as "nothing is waiting",
    // which is a different and wrong claim when the database is simply down.
    vi.mocked(getDb).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await appRouter.createCaller(context("admin")).admin.moderationQueue({});

    expect(result).toEqual({
      counts: { listing: 0, kyc: 0, partner: 0, refund: 0 },
      items: [],
    });
  });
});

describe("admin.moderationQueue counts", () => {
  it("reads the counts with count() rather than counting the returned page", async () => {
    // counts.listing is 50 while only 2 listing rows exist in the seed. If the
    // counts were derived from `items`, this would read 2.
    const { result } = await run({
      seed: seedRows({
        listing: [
          { id: 1, title: "أ", submittedAt: at("2026-01-01") },
          { id: 2, title: "ب", submittedAt: at("2026-01-02") },
        ],
      }),
      counts: { listing: 50, kyc: 0, partner: 0, refund: 0 },
    });

    expect(result.counts).toEqual({ listing: 50, kyc: 0, partner: 0, refund: 0 });
    expect(result.items).toHaveLength(2);
  });

  it("issues one count query per kind", async () => {
    const { fake } = await run();

    expect(countReads(fake.reads)).toHaveLength(4);
    expect(rowReads(fake.reads)).toHaveLength(4);
  });

  it("reports zero for a kind with nothing pending rather than omitting the key", async () => {
    // An omitted key renders as an empty badge and reads as "unknown", which is
    // a different claim from "there is nothing here".
    const { result } = await run();

    expect(Object.keys(result.counts).sort()).toEqual(["kyc", "listing", "partner", "refund"]);
    expect(result.counts.partner).toBe(0);
  });

  it("counts the kinds excluded by the kinds filter too", async () => {
    // Documented behaviour: the filter narrows the LIST, not the badge totals,
    // so an admin filtering to KYC still sees how much is backed up elsewhere.
    const { result } = await run(
      {
        seed: seedRows({ listing: [{ id: 1, title: "أ", submittedAt: at("2026-01-01") }] }),
        counts: { listing: 4, kyc: 1, partner: 0, refund: 0 },
      },
      { kinds: ["kyc"] },
    );

    expect(result.counts.listing).toBe(4);
    expect(result.items).toEqual([]);
  });
});

describe("admin.moderationQueue pending-status filters", () => {
  // The badge totals and the listed rows are eight separate queries. A correct
  // literal in one and a wrong-case literal in the other yields a page of rows
  // beside a badge reading zero, or the reverse -- and neither is visible in the
  // returned values, because a wrong-case literal simply matches nothing. Both
  // sets are asserted separately for that reason. (Mutation testing found this:
  // while only the row reads were checked, flipping the CASE of a single count
  // query's literal went undetected.)
  const literalsFor = (reads: Read[]) => (table: unknown) =>
    reads.find((read) => read.table === table)?.whereParams;

  it("filters each kind's listed rows on its own pending literal", async () => {
    const { fake } = await run();
    const literalFor = literalsFor(rowReads(fake.reads));

    expect(literalFor(listings)).toEqual(["Pending"]);
    expect(literalFor(kycSubmissions)).toEqual(["Pending"]);
    // partner_application_status is the only lowercase enum of the four.
    expect(literalFor(partnerApplications)).toEqual(["pending"]);
    expect(literalFor(refundRequests)).toEqual(["Pending"]);
  });

  it("filters each kind's count on the same pending literal", async () => {
    const { fake } = await run();
    const literalFor = literalsFor(countReads(fake.reads));

    expect(literalFor(listings)).toEqual(["Pending"]);
    expect(literalFor(kycSubmissions)).toEqual(["Pending"]);
    expect(literalFor(partnerApplications)).toEqual(["pending"]);
    expect(literalFor(refundRequests)).toEqual(["Pending"]);
  });
});

describe("admin.moderationQueue items", () => {
  const oneOfEach = (): Seed =>
    seedRows({
      listing: [{ id: 1, title: "سيارة", submittedAt: at("2026-01-01") }],
      kyc: [{ id: 2, userId: 5, userName: "سارة", submittedAt: at("2026-01-02") }],
      partner: [{ id: 3, agencyName: "وكالة", submittedAt: at("2026-01-03") }],
      refund: [{ id: 4, bookingId: 90, amount: 500, submittedAt: at("2026-01-04") }],
    });

  it("tags every row with its kind", async () => {
    const { result } = await run({ seed: oneOfEach() });

    expect(result.items.map((item) => item.kind)).toEqual(["listing", "kyc", "partner", "refund"]);
    expect(result.items.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it("orders the merged queue oldest-first", async () => {
    const { result } = await run({
      seed: seedRows({
        // Deliberately out of chronological order in the seed.
        refund: [{ id: 4, bookingId: 90, submittedAt: at("2026-01-09") }],
        listing: [{ id: 1, title: "سيارة", submittedAt: at("2026-01-05") }],
        kyc: [{ id: 2, userName: "سارة", submittedAt: at("2026-01-02") }],
      }),
    });

    const stamps = result.items.map((item) => new Date(item.submittedAt).toISOString().slice(0, 10));
    expect(stamps).toEqual(["2026-01-02", "2026-01-05", "2026-01-09"]);
  });

  it("excludes kinds the caller did not ask for", async () => {
    const { result } = await run({ seed: oneOfEach() }, { kinds: ["kyc", "refund"] });

    expect(result.items.map((item) => item.kind)).toEqual(["kyc", "refund"]);
  });

  it("treats an empty kinds array as every kind", async () => {
    const { result } = await run({ seed: oneOfEach() }, { kinds: [] });

    expect(result.items).toHaveLength(4);
  });

  it("caps the merged queue, not each kind separately", async () => {
    // Two of each, limit 2. A per-kind cap followed by no merge cap would
    // return 4 rows; a global cap returns 2.
    const { result } = await run(
      {
        seed: seedRows({
          listing: [
            { id: 1, title: "أ", submittedAt: at("2026-01-05") },
            { id: 2, title: "ب", submittedAt: at("2026-01-06") },
          ],
          kyc: [
            { id: 3, userName: "س", submittedAt: at("2026-01-01") },
            { id: 4, userName: "ص", submittedAt: at("2026-01-02") },
          ],
        }),
      },
      { limit: 2 },
    );

    expect(result.items).toHaveLength(2);
    // Both KYC rows are older than both listings, so FIFO keeps exactly those.
    expect(result.items.map((item) => item.kind)).toEqual(["kyc", "kyc"]);
  });

  it("keeps the oldest rows when one kind has more pending than the limit", async () => {
    // This is the property that makes the per-kind `orderBy(asc(...))` load
    // bearing: the per-query cap runs BEFORE the merge, so a descending
    // per-query order would drop the oldest listings here and the queue would
    // starve. The fake honours the recorded direction, so flipping `asc` to
    // `desc` in the procedure makes this fail.
    const { result, fake } = await run(
      {
        seed: seedRows({
          listing: [
            { id: 1, title: "الأحدث", submittedAt: at("2026-03-01") },
            { id: 2, title: "الأقدم", submittedAt: at("2026-01-01") },
            { id: 3, title: "الأوسط", submittedAt: at("2026-02-01") },
          ],
        }),
      },
      { limit: 2 },
    );

    expect(rowReads(fake.reads).every((read) => read.orderText.toLowerCase().includes("asc"))).toBe(true);
    expect(result.items.map((item) => item.title)).toEqual(["الأقدم", "الأوسط"]);
  });

  it("asks every per-kind query for a capped ascending read", async () => {
    const { fake } = await run({}, { limit: 7 });

    for (const read of rowReads(fake.reads)) {
      expect(read.limit).toBe(7);
      expect(read.orderText.toLowerCase()).toContain("asc");
    }
  });

  it("defaults to a limit of 25", async () => {
    const { fake } = await run({});

    for (const read of rowReads(fake.reads)) expect(read.limit).toBe(25);
  });
});

describe("admin.moderationQueue does not leak columns it does not render", () => {
  it("omits the partner applicant's password hash and salt", async () => {
    // partner_applications stores scrypt credentials on the row itself, and
    // adminProcedure is the only thing between them and the wire. The seed
    // carries them; narrowing must drop them.
    const { result } = await run({
      seed: seedRows({
        partner: [
          {
            id: 3,
            agencyName: "وكالة",
            submittedAt: at("2026-01-01"),
            passwordHash: "scrypt$secret",
            passwordSalt: "deadbeef",
            adminNote: "ملاحظة داخلية",
          },
        ],
      }),
      counts: { partner: 1 },
    });

    const partner = result.items.find((item) => item.kind === "partner");
    expect(partner).toBeDefined();
    expect(partner).not.toHaveProperty("passwordHash");
    expect(partner).not.toHaveProperty("passwordSalt");
    expect(partner).not.toHaveProperty("adminNote");
  });

  it("omits listing copy the queue does not render", async () => {
    const { result } = await run({
      seed: seedRows({
        listing: [{ id: 1, title: "سيارة", submittedAt: at("2026-01-01"), description: "تفاصيل كاملة" }],
      }),
      counts: { listing: 1 },
    });

    expect(result.items[0]).not.toHaveProperty("description");
    expect(result.items[0]).toHaveProperty("title");
  });

  it("omits the KYC provider session id while keeping the masked document number", async () => {
    const { result } = await run({
      seed: seedRows({
        kyc: [
          {
            id: 2,
            userId: 5,
            documentType: "cni",
            submittedAt: at("2026-01-01"),
            documentNumberMasked: "AB12***",
            providerSessionId: "pi_session_secret",
            rejectionReason: "سبب سابق",
          },
        ],
      }),
      counts: { kyc: 1 },
    });

    const kyc = result.items.find((item) => item.kind === "kyc");
    expect(kyc).not.toHaveProperty("providerSessionId");
    expect(kyc).not.toHaveProperty("rejectionReason");
    expect(kyc?.documentNumberMasked).toBe("AB12***");
  });

  it("omits the refund reviewer's identity from a display-only row", async () => {
    // The queue shows refunds but moves no money, so reviewedBy and adminNote
    // have no business on the wire.
    const { result } = await run({
      seed: seedRows({
        refund: [
          {
            id: 4,
            bookingId: 90,
            amount: 500,
            submittedAt: at("2026-01-01"),
            reviewedBy: ADMIN_ID,
            adminNote: "تمت المعالجة",
          },
        ],
      }),
      counts: { refund: 1 },
    });

    const refund = result.items.find((item) => item.kind === "refund");
    expect(refund).not.toHaveProperty("reviewedBy");
    expect(refund).not.toHaveProperty("adminNote");
  });
});

describe("admin.moderationQueue access and input limits", () => {
  it("rejects a non-admin caller", async () => {
    for (const role of ["renter", "owner"] as const) {
      const fake = makeFakeDb();
      useDb(fake);

      await expect(
        appRouter.createCaller(context(role)).admin.moderationQueue({}),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fake.reads).toHaveLength(0);
    }
  });

  it("allows a super admin", async () => {
    const { result } = await run({}, {}, "SUPER_ADMIN");

    expect(result.counts).toBeDefined();
  });

  it("refuses a limit outside 1..100", async () => {
    for (const limit of [0, -1, 101, 2.5]) {
      const fake = makeFakeDb();
      useDb(fake);

      await expect(
        appRouter.createCaller(context("admin")).admin.moderationQueue({ limit }),
      ).rejects.toThrow();
      expect(fake.reads).toHaveLength(0);
    }
  });

  it("refuses more kinds than the enum has", async () => {
    const fake = makeFakeDb();
    useDb(fake);

    await expect(
      appRouter.createCaller(context("admin")).admin.moderationQueue({
        kinds: ["listing", "kyc", "partner", "refund", "listing"] as Kind[],
      }),
    ).rejects.toThrow();
    expect(fake.reads).toHaveLength(0);
  });

  it("refuses a kind outside the enum", async () => {
    const fake = makeFakeDb();
    useDb(fake);

    await expect(
      appRouter.createCaller(context("admin")).admin.moderationQueue({
        kinds: ["dispute"] as unknown as Kind[],
      }),
    ).rejects.toThrow();
    expect(fake.reads).toHaveLength(0);
  });
});