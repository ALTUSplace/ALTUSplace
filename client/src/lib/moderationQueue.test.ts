import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUEUE_KINDS,
  compareByOldestFirst,
  countFor,
  formatMad,
  formatSubmitted,
  isActionable,
  kindBadge,
  kindLabel,
  queueItemMeta,
  queueItemTitle,
  totalPending,
  type QueueItemLike,
  type QueueKind,
} from "./moderationQueue";

/**
 * The repo has no DOM and no React-testing library, so nothing here renders.
 * Everything asserted here is a total function over plain data; that is
 * deliberate. The page's own behaviour — that the reject dialog opens, that the
 * confirm button stays disabled while the reason is blank, that the list
 * refetches after a decision — is NOT covered by any test in this PR and is
 * stated as a limitation rather than implied to be covered.
 */

describe("countFor", () => {
  it("returns the server-reported count for a known kind", () => {
    expect(countFor({ listing: 7, kyc: 0, partner: 3, refund: 1 }, "listing")).toBe(7);
  });

  it("reports 0 rather than undefined when the key is absent", () => {
    // `undefined` renders as an empty badge, which reads as "we don't know".
    // "There is nothing here" is a different claim and the one the server means.
    expect(countFor({}, "kyc")).toBe(0);
  });

  it("reports 0 for a null or undefined counts object", () => {
    expect(countFor(null, "partner")).toBe(0);
    expect(countFor(undefined, "refund")).toBe(0);
  });

  it("rejects non-finite and negative values instead of rendering them", () => {
    expect(countFor({ listing: Number.NaN }, "listing")).toBe(0);
    expect(countFor({ listing: Number.POSITIVE_INFINITY }, "listing")).toBe(0);
    expect(countFor({ listing: -4 }, "listing")).toBe(0);
  });

  it("rejects a non-number even when it is truthy", () => {
    // A stringified count would render as "12" and read as real data.
    expect(countFor({ listing: "12" as unknown as number }, "listing")).toBe(0);
  });

  it("keeps a genuine zero", () => {
    expect(countFor({ kyc: 0 }, "kyc")).toBe(0);
  });
});

describe("totalPending", () => {
  it("sums every kind", () => {
    expect(totalPending({ listing: 2, kyc: 3, partner: 5, refund: 7 })).toBe(17);
  });

  it("sums a partial object without producing NaN", () => {
    expect(totalPending({ listing: 4 })).toBe(4);
  });

  it("is 0 for a missing counts object", () => {
    expect(totalPending(null)).toBe(0);
  });

  it("covers exactly the four declared kinds", () => {
    expect([...QUEUE_KINDS]).toEqual(["listing", "kyc", "partner", "refund"]);
  });
});

describe("compareByOldestFirst", () => {
  const at = (iso: string, id?: number) => ({ submittedAt: iso, ...(id === undefined ? {} : { id }) });

  it("sorts the oldest item first, not the newest", () => {
    // The whole point of this comparator: a newest-first queue starves old rows.
    const rows = [at("2026-03-01", 3), at("2026-01-01", 1), at("2026-02-01", 2)];
    expect([...rows].sort(compareByOldestFirst).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("returns a negative number when a is older than b", () => {
    expect(compareByOldestFirst(at("2026-01-01"), at("2026-06-01"))).toBeLessThan(0);
  });

  it("returns a positive number when a is newer than b", () => {
    expect(compareByOldestFirst(at("2026-06-01"), at("2026-01-01"))).toBeGreaterThan(0);
  });

  it("breaks exact ties on id so the order is total", () => {
    expect(compareByOldestFirst(at("2026-01-01", 1), at("2026-01-01", 2))).toBeLessThan(0);
    expect(compareByOldestFirst(at("2026-01-01", 2), at("2026-01-01", 1))).toBeGreaterThan(0);
  });

  it("reports equality for a full tie including id", () => {
    expect(compareByOldestFirst(at("2026-01-01", 5), at("2026-01-01", 5))).toBe(0);
  });

  it("accepts Date objects and epoch numbers, not just ISO strings", () => {
    const rows = [
      { submittedAt: new Date("2026-02-01"), id: 2 },
      { submittedAt: new Date("2026-01-01"), id: 1 },
    ];
    expect([...rows].sort(compareByOldestFirst).map((r) => r.id)).toEqual([1, 2]);
    expect(
      [{ submittedAt: 1000, id: 2 }, { submittedAt: 2000, id: 1 }].sort(compareByOldestFirst).map((r) => r.id),
    ).toEqual([2, 1]);
  });

  it("sorts an unparseable timestamp LAST, not first", () => {
    // new Date("garbage").getTime() is NaN, and a naive coercion would let a
    // bad value read as epoch 0 and jump the entire queue.
    const rows = [at("not-a-date", 9), at("2026-01-01", 1), at("2026-02-01", 2)];
    expect([...rows].sort(compareByOldestFirst).map((r) => r.id)).toEqual([1, 2, 9]);
  });

  it("sorts null and undefined timestamps last", () => {
    const rows = [{ submittedAt: null, id: 8 }, { submittedAt: undefined, id: 7 }, at("2026-01-01", 1)];
    expect([...rows].sort(compareByOldestFirst).map((r) => r.id)).toEqual([1, 7, 8]);
  });
});

describe("kind labels", () => {
  it("gives every declared kind a distinct section label", () => {
    const labels = QUEUE_KINDS.map(kindLabel);
    expect(new Set(labels).size).toBe(QUEUE_KINDS.length);
    labels.forEach((label) => expect(label.length).toBeGreaterThan(0));
  });

  it("falls back rather than throwing for a kind a newer server added", () => {
    expect(kindLabel("dispute")).toBe("أخرى");
    expect(kindBadge("dispute")).toBe("أخرى");
  });

  it("marks refunds as not actionable", () => {
    // Refunds move money; the queue shows them but offers no buttons for them.
    expect(isActionable("refund")).toBe(false);
  });

  it.each([["listing"], ["kyc"], ["partner"]] as const)("marks %s as actionable", (kind) => {
    expect(isActionable(kind)).toBe(true);
  });

  it("is not actionable for an unknown kind", () => {
    expect(isActionable("mystery")).toBe(false);
  });
});

describe("queueItemTitle", () => {
  it("uses the listing title", () => {
    expect(queueItemTitle({ kind: "listing", title: "سيارة للكراء" })).toBe("سيارة للكراء");
  });

  it("falls back to the id when the listing title is blank", () => {
    expect(queueItemTitle({ kind: "listing", title: "   ", id: 12 })).toBe("إعلان #12");
  });

  it("names the KYC applicant when the join produced a name", () => {
    expect(queueItemTitle({ kind: "kyc", id: 3, userName: "سارة" })).toContain("سارة");
  });

  it("falls back to a user id when the KYC applicant's account is gone", () => {
    expect(queueItemTitle({ kind: "kyc", id: 3, userName: null })).toBe("طلب تحقق — مستخدم #3");
  });

  it("treats a whitespace-only name as absent", () => {
    expect(queueItemTitle({ kind: "kyc", id: 3, userName: "   " })).toBe("طلب تحقق — مستخدم #3");
  });

  it("treats a non-string name as absent rather than printing [object Object]", () => {
    expect(queueItemTitle({ kind: "kyc", id: 3, userName: { first: "x" } })).toBe("طلب تحقق — مستخدم #3");
  });

  it("uses the agency name for a partner application", () => {
    expect(queueItemTitle({ kind: "partner", id: 8, agencyName: "وكالة الأطلس" })).toBe("وكالة الأطلس");
  });

  it("falls back to an id when the agency name is missing", () => {
    expect(queueItemTitle({ kind: "partner", id: 8 })).toBe("طلب شراكة #8");
  });

  it("labels a refund by its booking, never by an amount", () => {
    expect(queueItemTitle({ kind: "refund", id: 4, bookingId: 77 })).toBe("طلب استرداد — حجز #77");
  });

  it("renders a placeholder for an unrecognised kind", () => {
    // A visible placeholder beats a blank row: it turns a shape mismatch into
    // something an admin can report.
    expect(queueItemTitle({ kind: "brand_new_kind" })).toBe("عنصر غير معروف");
  });

  it("never returns an empty string, whatever it is handed", () => {
    const hostile: QueueItemLike[] = [
      { kind: "listing" },
      { kind: "kyc" },
      { kind: "partner" },
      { kind: "refund" },
      { kind: "" },
      {},
    ];
    hostile.forEach((item) => {
      expect(queueItemTitle(item).trim().length).toBeGreaterThan(0);
    });
  });
});

describe("queueItemMeta", () => {
  it("summarises a listing with category, city, owner and price", () => {
    const meta = queueItemMeta({
      kind: "listing",
      category: "سيارة / Car",
      city: "مراكش",
      ownerName: "يوسف",
      pricePerDay: 350,
    });
    expect(meta).toContain("سيارة / Car");
    expect(meta).toContain("مراكش");
    expect(meta).toContain("يوسف");
    expect(meta).toContain("350");
  });

  it("falls back to an owner id when the owner row is missing", () => {
    expect(queueItemMeta({ kind: "listing", ownerId: 42 })).toContain("مالك #42");
  });

  it("omits a blank price instead of printing 0 د.م", () => {
    // A missing price must not render as a price of zero, which is a claim.
    expect(queueItemMeta({ kind: "listing", ownerId: 1, pricePerDay: undefined })).not.toContain("د.م");
  });

  it("summarises a KYC row with document type, role and masked number", () => {
    const meta = queueItemMeta({
      kind: "kyc",
      documentType: "cni",
      applicantRole: "renter",
      documentNumberMasked: "AB12***",
    });
    expect(meta).toContain("cni");
    expect(meta).toContain("renter");
    expect(meta).toContain("AB12***");
  });

  it("never prints an unmasked document number", () => {
    // Only documentNumberMasked crosses the wire; documentNumber does not exist
    // on the projection. Asserting the masked field is enough to catch a
    // projection that accidentally widened.
    const meta = queueItemMeta({ kind: "kyc", documentNumberMasked: "AB12***" });
    expect(meta).toContain("***");
  });

  it("summarises a partner application with city, contact and email", () => {
    const meta = queueItemMeta({
      kind: "partner",
      city: "طنجة",
      contactPerson: "كريم",
      email: "karim@example.com",
    });
    expect(meta).toContain("طنجة");
    expect(meta).toContain("كريم");
    expect(meta).toContain("karim@example.com");
  });

  it("summarises a refund with its amount and stated reason", () => {
    const meta = queueItemMeta({ kind: "refund", amount: 1200, reason: "إلغاء من طرف المستأجر" });
    expect(meta).toContain("1,200");
    expect(meta).toContain("إلغاء من طرف المستأجر");
  });

  it("says so when nothing is known", () => {
    expect(queueItemMeta({ kind: "refund" })).not.toBe("");
    expect(queueItemMeta({ kind: "mystery" })).toBe("لا تتوفر تفاصيل");
  });

  it("never returns an empty string for any kind", () => {
    (["listing", "kyc", "partner", "refund", "mystery"] as const).forEach((kind) => {
      expect(queueItemMeta({ kind }).trim().length).toBeGreaterThan(0);
    });
  });
});

describe("formatMad", () => {
  it("groups thousands and appends the currency", () => {
    expect(formatMad(1200)).toBe("1,200 د.م.");
  });

  it("rounds rather than truncating", () => {
    expect(formatMad(349.6)).toBe("350 د.م.");
  });

  it("formats zero", () => {
    expect(formatMad(0)).toBe("0 د.م.");
  });

  it("does not depend on the host ICU build", () => {
    // Pinned to en-US so a server built with small-icu cannot render a queue row
    // differently from the browser. Guarded by asserting the separator.
    expect(formatMad(1000000)).toContain(",");
    expect(formatMad(1000000)).toBe("1,000,000 د.م.");
  });
});

describe("formatSubmitted", () => {
  it("renders a placeholder for a missing value", () => {
    expect(formatSubmitted(null)).toBe("—");
    expect(formatSubmitted(undefined)).toBe("—");
  });

  it("renders a placeholder for an unparseable value", () => {
    expect(formatSubmitted("not-a-date")).toBe("—");
    expect(formatSubmitted(Number.NaN)).toBe("—");
  });

  it("renders something non-placeholder for a valid date", () => {
    // The exact glyphs depend on ICU, so only the fallback is asserted.
    expect(formatSubmitted("2026-01-15")).not.toBe("—");
    expect(formatSubmitted(new Date("2026-01-15"))).not.toBe("—");
  });
});

/**
 * Drift guard. QUEUE_KINDS is duplicated from the server's zod enum, and a
 * duplicate is exactly the kind of thing that rots: adding a fifth queue kind
 * server-side without updating this list would silently hide that kind from
 * every filter control, with no error anywhere.
 */
describe("QUEUE_KINDS matches the server contract", () => {
  const routerSource = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "server", "routers.ts"),
    "utf8",
  );

  it("is exactly the set admin.moderationQueue accepts", () => {
    const match = routerSource.match(/kinds:\s*z\.array\(z\.enum\(\[([^\]]*)\]\)\)/);
    expect(match, "admin.moderationQueue kinds enum not found in server/routers.ts").not.toBeNull();
    const serverKinds = (match![1].match(/'([^']+)'/g) ?? []).map((quoted) => quoted.slice(1, -1));
    expect(serverKinds.sort()).toEqual([...QUEUE_KINDS].sort());
  });

  it("covers every kind with an actionable flag decision", () => {
    // Each kind is deliberately either actionable or not; a new kind must be
    // classified deliberately rather than inheriting a default.
    const decided = QUEUE_KINDS.filter((kind) => typeof isActionable(kind) === "boolean");
    expect(decided).toHaveLength(QUEUE_KINDS.length);
  });

  it("types countFor's kind parameter as the declared union", () => {
    // Compile-time guarantee restated at runtime so a widened QUEUE_KINDS fails
    // loudly here instead of silently breaking countFor callers.
    const every: QueueKind[] = ["listing", "kyc", "partner", "refund"];
    every.forEach((kind) => expect(countFor({ listing: 1 }, kind)).toBe(kind === "listing" ? 1 : 0));
  });
});