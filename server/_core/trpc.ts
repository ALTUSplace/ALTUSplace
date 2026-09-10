import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure.use(
  t.middleware(async opts => {
    // Enterprise XSS shield: recursively sanitize + HTML-escape every string
    // in the validated procedure input before any handler runs. Numbers,
    // booleans, dates and arrays lengths are untouched; zod limits still apply.
    const { sanitizeTrpcInput } = await import("./security");
    const input = (opts as { input?: unknown }).input;
    if (input !== undefined && input !== null) {
      return opts.next({ input: sanitizeTrpcInput(input) });
    }
    return opts.next();
  }),
);

export const sanitizeInputMiddleware = t.middleware(async opts => {
  const { sanitizeTrpcInput } = await import("./security");
  const input = (opts as { input?: unknown }).input;
  if (input !== undefined && input !== null) {
    return opts.next({ input: sanitizeTrpcInput(input) });
  }
  return opts.next();
});

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

export const protectedProcedure = t.procedure.use(sanitizeInputMiddleware).use(requireUser);

export const ownerProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!['owner', 'admin'].includes(ctx.user!.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'هذه العملية مخصصة للملاك.' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const adminProcedure = t.procedure.use(sanitizeInputMiddleware).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
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
