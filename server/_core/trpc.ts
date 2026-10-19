import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { SpamGuardSurface } from "./security";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// L-4: tRPC inputs are stored VERBATIM. The old global input-escaping
// middleware HTML-escaped every string before zod even ran, which corrupted
// real data (`&` became `&amp;` inside URLs, e-mail addresses and passwords)
// while buying no XSS defense: React escapes on render, JSON-LD payloads
// escape `<` when serialized (client/src/lib/seo.ts), and server-rendered
// HTML (prerender, notification e-mails) escapes at its own boundary.
export const publicProcedure = t.procedure;

/**
 * M-6: per-IP guard for public, abuse-prone mutations. The HTTP tier
 * classifier can only bucket these as `standard` (300/min) — it sees the
 * path, not the side effect — so each surface gets its own budget here,
 * enforced on the same store as the Express tiers (Redis when configured,
 * in-memory fallback otherwise). Limits live in `SPAM_GUARD_LIMITS`
 * (server/_core/security.ts).
 */
export function spamGuard(surface: SpamGuardSurface) {
  return t.middleware(async opts => {
    const { checkRateLimit, clientIp, SPAM_GUARD_LIMITS } = await import("./security");
    const limits = SPAM_GUARD_LIMITS[surface];
    const result = await checkRateLimit(clientIp(opts.ctx.req), limits);
    if (!result.success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: limits.message ?? "Too many requests. Try again in a minute.",
      });
    }
    return opts.next();
  });
}

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

    if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
    if (ctx.user.accountStatus && ctx.user.accountStatus !== "active") {
      throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب غير نشط." });
    }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Owner tier: FULL rental-operator capabilities. `partner` accounts are
// self-registered and never admin-vetted (POSTing the partner signup form is
// enough — see _core/partnerAuth.ts), so they are deliberately EXCLUDED here.
// Anything that surfaces another person's data (bookings.ownerList → renter
// PII), money (ownerFinancials, payouts.request) or generated contracts
// (rentalContracts.createForBooking) stays on this tier and is therefore
// owner/admin/SUPER_ADMIN only.
export const ownerProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!['owner', 'admin', 'SUPER_ADMIN'].includes(ctx.user!.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'هذه العملية مخصصة للملاك.' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// Partner tier (M-1): the widest tier a self-registered `partner` may reach.
// Every procedure behind it MUST scope its SQL to `ctx.user!.id` — own
// listings, own agency profile/settings, own media uploads — and must never
// return or mutate another account's rows. Cross-account procedures stay on
// `ownerProcedure` above.
export const partnerProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!['owner', 'admin', 'partner', 'SUPER_ADMIN'].includes(ctx.user!.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'هذه العملية مخصصة للملاك والشركاء.' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// Composed off protectedProcedure (NOT t.procedure) so the admin tier runs the
// same requireUser gate as every other authenticated tier. Before this, a
// banned or suspended admin kept full access — including the ability to lift
// their own ban via admin.updateUserStatus.
export const adminProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !['admin', 'SUPER_ADMIN'].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Super-admin tier: the ONLY role that may query or view the executive
// financial dashboard, escrow/ledger monitor and dynamic commission
// controller. Enforced on every procedure of the `admin.super` router.
// Same requireUser gate as the admin tier: a suspended/banned SUPER_ADMIN must
// not retain the executive dashboard, escrow monitor or commission controller.
export const superAdminProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'SUPER_ADMIN') {
      throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية مخصصة لمديري المنصة الأساسيين (SUPER ADMIN) فقط." });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
