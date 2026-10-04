import { describe, expect, it } from "vitest";
import { auditNote } from "./auditNote";

/**
 * The audit feed must never lose a rejection reason. Rows written before the
 * `notes` column was populated hold the reason only inside the `afterData`
 * JSON, so `notes` alone would blank out every historical reason on deploy.
 */
describe("auditNote", () => {
  it("returns the notes column when it is populated", () => {
    expect(auditNote({ notes: "blurry photo", afterData: null })).toBe("blurry photo");
  });

  it("prefers notes over a stale afterData reason", () => {
    const entry = { notes: "current reason", afterData: JSON.stringify({ reason: "old reason" }) };
    expect(auditNote(entry)).toBe("current reason");
  });

  it("falls back to afterData.reason for rows written before the column existed", () => {
    const entry = { notes: null, afterData: JSON.stringify({ status: "Rejected", reason: "blurry photo" }) };
    expect(auditNote(entry)).toBe("blurry photo");
  });

  it("returns null when the entry carries no reason at all", () => {
    expect(auditNote({ notes: null, afterData: null })).toBeNull();
    expect(auditNote({})).toBeNull();
    // An approve row: afterData has a status but no reason.
    expect(auditNote({ notes: null, afterData: JSON.stringify({ status: "Approved" }) })).toBeNull();
  });

  it("treats blank notes as absent rather than rendering an empty reason", () => {
    expect(auditNote({ notes: "   ", afterData: null })).toBeNull();
  });

  it("survives a malformed or non-string afterData payload", () => {
    expect(auditNote({ notes: null, afterData: "{not json" })).toBeNull();
    expect(auditNote({ notes: null, afterData: JSON.stringify({ reason: 42 }) })).toBeNull();
    expect(auditNote({ notes: null, afterData: JSON.stringify({ reason: "   " }) })).toBeNull();
  });

  it("trims surrounding whitespace off the reason", () => {
    expect(auditNote({ notes: "  blurry photo  " })).toBe("blurry photo");
    expect(auditNote({ notes: null, afterData: JSON.stringify({ reason: "  blurry photo  " }) })).toBe("blurry photo");
  });
});