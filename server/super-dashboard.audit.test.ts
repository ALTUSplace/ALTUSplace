import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

describe("super admin dashboard audit contracts", () => {
  it("computes overview KPIs split by category with live active-status counters and a pending queue", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("overviewKpis: superAdminProcedure.query");
    expect(routers).toContain("activeStatuses = ['Published', 'Approved', 'Available']");
    expect(count(routers, /eq\(listings\.category, '"?(car|real_estate)'?\)/g)).toBeGreaterThanOrEqual(2);
    expect(routers).toContain("pendingQueue");
  });

  it("limits the moderation queue to Pending listings ordered oldest-first", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("moderationQueue: superAdminProcedure.query");
    expect(routers).toContain("where(eq(listings.status, 'Pending'))");
    expect(routers).toContain("orderBy(asc(listings.createdAt))");
    expect(routers).toContain(".limit(100)");
  });

  it("writes an audit trail with before/after status and reason for approve and reject", () => {
    const routers = read("server/routers.ts");
    expect(routers).toMatch(/action: `listing\.\$\{input\.action === 'approve' \? 'approved' : 'rejected'\}`/);
    expect(routers).toContain("'approved' : 'rejected'");
    expect(routers).toContain("afterData: { status: nextStatus, reason: input.reason ?? null }");
  });

  it("notifies the listing owner with the decision and the rejection reason", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("safeNotifyUser({");
    expect(routers).toContain("userId: before.ownerId");
    expect(routers).toMatch(/type: input\.action === 'approve' \? 'listing_approved' : 'listing_rejected'/);
    expect(routers).toContain("reasonLabel");
  });

  it("refuses to moderate a listing that has already been decided", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("if (before.status === 'Rejected' || before.status === 'Published')");
    expect(routers).toContain("code: 'CONFLICT'");
  });

  it("audits role and account-status changes with before/after data", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("action: 'user.role_updated'");
    expect(routers).toContain("beforeData: before, afterData: { role: input.role }");
    expect(routers).toMatch(/action: `user\.\$\{input\.status\}`/);
    expect(routers).toContain("beforeData: before, afterData: { accountStatus: input.status }");
  });

  it("protects the super account from self-role/freeze changes", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("if (input.userId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تغيير دور حسابك الإداري بنفسك.' })");
    expect(routers).toContain("if (input.userId === ctx.user.id && input.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تعطيل حسابك الإداري.' })");
  });

  it("reports WhatsApp API configuration and reachability with a bounded latency probe", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("health: superAdminProcedure.query");
    expect(routers).toContain("process.env.WHATSAPP_ACCESS_TOKEN");
    expect(routers).toContain("process.env.WHATSAPP_PHONE_NUMBER_ID");
    expect(routers).toContain("graph.facebook.com");
    expect(routers).toContain("AbortSignal.timeout(4000)");
    expect(routers).toContain("webhookConfigured: false");
  });

  it("measures database latency with a trivial ping when the pool is available", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("await db.execute(sql`select 1`)");
  });
});