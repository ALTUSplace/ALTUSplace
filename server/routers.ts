import { COOKIE_NAME } from "@shared/const";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, ownerProcedure, publicProcedure, protectedProcedure, router, superAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { listings, listingAnalyticsEvents, listingComments, bookings, reviews, users, commercialLeaseContracts, notifications, platformSettings, commissionTiers, escrowEntries, payoutRequests, disputes, disputeAttachments, supportTickets, payments, invoices, kycSubmissions, bookingVouchers, bookingMessages, auditLogs, refundRequests } from "../drizzle/schema";
import { eq, and, lte, gte, lt, gt, desc, count, isNull, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { safeNotifyUser, buildEmailContent } from "./notificationService";
import { z } from "zod";
import { storageGet, storagePut } from "./storage";
import { generateServerCommercialLeasePdf } from "./commercialLeasePdf";
import { createHeartbeatJob } from "./_core/heartbeat";
import { calculateInvoiceTotals, createInvoiceNumber, getSimulatedPaymentStatus } from "./billing";
import { buildVoucherOwnerMessage, buildVoucherRenterMessage, createMapsSearchUrl, createVoucherCode } from "../shared/voucher";
import { escapeIcal, parseIcalEvents, validateIcalImportUrl } from "../shared/ical";
import { syncListingIcal } from "./ical";
import { CANCELLATION_POLICY_VERSION, CANCELLATION_POLICY_TEXT, CANCELLATION_POLICY_FINGERPRINT } from "../shared/cancellationPolicySnapshot";
import { createImageVerificationProof, ORIGINAL_IMAGE_REJECTION_MESSAGE, verifyImageVerificationProof, verifyOriginalListingImage } from "./imageVerification";
import { isRangeAvailable, overlaps, parseBlockedRanges, parseDateRange } from "./availability";
import { getTranslatedListing, getTranslationStats, invalidateTranslationCache, isTranslationAvailable, SUPPORTED_LANGUAGES, translateWithAws } from "./_core/translation";
import { ENV } from "./_core/env";
import { getKycStatusPayload } from "./verification/eligibility";
import { maskDocumentNumber } from "./verification/requirements";
import { createEscrowEntry, freezeEscrowEntry, getGlobalCommission, getTierCommission, mediateEscrowEntry, releaseEscrowEntry, resolveEffectiveCommission, upsertGlobalCommission, upsertTierCommission, VENDOR_TIERS } from "./escrow";

async function writeAuditLog(input: {
  actorId: number;
  action: string;
  entityType: string;
  entityId?: number;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeData: input.beforeData === undefined ? null : JSON.stringify(input.beforeData),
    afterData: input.afterData === undefined ? null : JSON.stringify(input.afterData),
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      const user = ctx.user;
      if (!user) return null;
      return {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        whatsappPhone: user.whatsappPhone,
        commercialRegister: user.commercialRegister,
        agencyName: user.agencyName,
        agencyLogoUrl: user.agencyLogoUrl,
        agencyPhone: user.agencyPhone,
        agencyEmail: user.agencyEmail,
        agencyAddress: user.agencyAddress,
        agencyWebsite: user.agencyWebsite,
        loginMethod: user.loginMethod,
        role: user.role,
        accountStatus: user.accountStatus,
      };
    }),
    updateProfile: protectedProcedure
      .input(z.object({
        whatsappPhone: z.string().trim().max(32).optional().nullable(),
        commercialRegister: z.string().trim().max(120).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const normalize = (value?: string | null) => value?.trim() || null;
        await db.update(users).set({
          whatsappPhone: normalize(input.whatsappPhone),
          commercialRegister: normalize(input.commercialRegister),
        }).where(eq(users.id, ctx.user!.id));
        return { success: true as const };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  agency: router({
    settings: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
      const rows = await db.select({
        agencyName: users.agencyName,
        agencyLogoUrl: users.agencyLogoUrl,
        agencyPhone: users.agencyPhone,
        agencyEmail: users.agencyEmail,
        agencyAddress: users.agencyAddress,
        agencyWebsite: users.agencyWebsite,
        agencyLatitude: users.agencyLatitude,
        agencyLongitude: users.agencyLongitude,
        agencyHours: users.agencyHours,
        commercialRegister: users.commercialRegister,
        whatsappPhone: users.whatsappPhone,
      }).from(users).where(eq(users.id, ctx.user!.id)).limit(1);
      return rows[0] ?? null;
    }),
    statusSummary: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const empty = { counts: { pending: 0, published: 0, rejected: 0 }, total: 0, listings: [] as Array<{ id: number; title: string; city: string; category: string; status: string; normalizedStatus: "pending" | "published" | "rejected"; createdAt: Date | null }> };
      if (!db) return empty;
      const owned = await db.select({ id: listings.id, title: listings.title, city: listings.city, category: listings.category, status: listings.status, createdAt: listings.createdAt })
        .from(listings).where(eq(listings.ownerId, ctx.user!.id)).orderBy(desc(listings.createdAt));
      const result = owned.map((listing) => {
        const normalizedStatus = listing.status === "Rejected" ? "rejected" : listing.status === "Pending" ? "pending" : "published";
        return { ...listing, normalizedStatus };
      });
      return {
        total: result.length,
        counts: {
          pending: result.filter((listing) => listing.normalizedStatus === "pending").length,
          published: result.filter((listing) => listing.normalizedStatus === "published").length,
          rejected: result.filter((listing) => listing.normalizedStatus === "rejected").length,
        },
        listings: result,
      };
    }),
    updateSettings: ownerProcedure
      .input(z.object({
        agencyName: z.string().trim().max(180).optional().nullable(),
        agencyPhone: z.string().trim().max(32).optional().nullable(),
        agencyEmail: z.string().trim().email().max(320).optional().nullable(),
        agencyAddress: z.string().trim().max(255).optional().nullable(),
        agencyWebsite: z.string().trim().url().max(255).optional().nullable(),
        agencyLatitude: z.string().trim().regex(/^-?\d{1,2}(?:\.\d{1,8})?$/).max(32).optional().nullable(),
        agencyLongitude: z.string().trim().regex(/^-?\d{1,3}(?:\.\d{1,8})?$/).max(32).optional().nullable(),
        agencyHours: z.string().trim().max(2000).optional().nullable(),
        commercialRegister: z.string().trim().max(120).optional().nullable(),
        whatsappPhone: z.string().trim().max(32).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const normalize = (value?: string | null) => value?.trim() || null;
        await db.update(users).set({
          agencyName: normalize(input.agencyName),
          agencyPhone: normalize(input.agencyPhone),
          agencyEmail: normalize(input.agencyEmail),
          agencyAddress: normalize(input.agencyAddress),
          agencyWebsite: normalize(input.agencyWebsite),
          agencyLatitude: normalize(input.agencyLatitude),
          agencyLongitude: normalize(input.agencyLongitude),
          agencyHours: normalize(input.agencyHours),
          commercialRegister: normalize(input.commercialRegister),
          whatsappPhone: normalize(input.whatsappPhone),
        }).where(eq(users.id, ctx.user!.id));
        await writeAuditLog({ actorId: ctx.user!.id, action: "agency.settings.updated", entityType: "user", entityId: ctx.user!.id, afterData: { agencyName: normalize(input.agencyName), agencyPhone: normalize(input.agencyPhone), agencyEmail: normalize(input.agencyEmail) } });
        return { success: true as const };
      }),
    listings: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const owned = await db.select().from(listings).where(eq(listings.ownerId, ctx.user!.id)).orderBy(desc(listings.createdAt));
      if (!owned.length) return [];
      const events = await db.select({ listingId: listingAnalyticsEvents.listingId, eventType: listingAnalyticsEvents.eventType, total: count() })
        .from(listingAnalyticsEvents)
        .where(inArray(listingAnalyticsEvents.listingId, owned.map((listing) => listing.id)))
        .groupBy(listingAnalyticsEvents.listingId, listingAnalyticsEvents.eventType);
      const counts = new Map<number, { views: number; whatsappClicks: number; contactClicks: number }>();
      for (const event of events) {
        const current = counts.get(event.listingId) ?? { views: 0, whatsappClicks: 0, contactClicks: 0 };
        if (event.eventType === "view") current.views = Number(event.total);
        if (event.eventType === "whatsapp_click") current.whatsappClicks = Number(event.total);
        if (event.eventType === "contact_click") current.contactClicks = Number(event.total);
        counts.set(event.listingId, current);
      }
      return owned.map((listing) => ({ ...listing, analytics: counts.get(listing.id) ?? { views: 0, whatsappClicks: 0, contactClicks: 0 } }));
    }),
    overview: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { totalListings: 0, availableListings: 0, unavailableListings: 0, activeBookings: 0, views: 0, whatsappClicks: 0, contactClicks: 0, grossRevenue: 0, netRevenue: 0 };
      const owned = await db.select({ id: listings.id, status: listings.status }).from(listings).where(eq(listings.ownerId, ctx.user!.id));
      const listingIds = owned.map((listing) => listing.id);
      if (!listingIds.length) return { totalListings: 0, availableListings: 0, unavailableListings: 0, activeBookings: 0, views: 0, whatsappClicks: 0, contactClicks: 0, grossRevenue: 0, netRevenue: 0 };
      const [eventRows, bookingRows] = await Promise.all([
        db.select({ eventType: listingAnalyticsEvents.eventType, total: count() }).from(listingAnalyticsEvents).where(inArray(listingAnalyticsEvents.listingId, listingIds)).groupBy(listingAnalyticsEvents.eventType),
        db.select({ status: bookings.status, totalPrice: bookings.totalPrice, netProfit: bookings.netProfit }).from(bookings).where(inArray(bookings.listingId, listingIds)),
      ]);
      const eventTotals = { views: 0, whatsappClicks: 0, contactClicks: 0 };
      for (const row of eventRows) {
        if (row.eventType === "view") eventTotals.views = Number(row.total);
        if (row.eventType === "whatsapp_click") eventTotals.whatsappClicks = Number(row.total);
        if (row.eventType === "contact_click") eventTotals.contactClicks = Number(row.total);
      }
      return {
        totalListings: owned.length,
        availableListings: owned.filter((listing) => listing.status === "Published" || listing.status === "Available").length,
        unavailableListings: owned.filter((listing) => listing.status === "Rented" || listing.status === "Rejected").length,
        activeBookings: bookingRows.filter((booking) => booking.status === "Pending" || booking.status === "Confirmed").length,
        ...eventTotals,
        grossRevenue: bookingRows.filter((booking) => booking.status === "Confirmed").reduce((sum, booking) => sum + Number(booking.totalPrice), 0),
        netRevenue: bookingRows.filter((booking) => booking.status === "Confirmed").reduce((sum, booking) => sum + Number(booking.netProfit), 0),
      };
    }),
    analyticsTimeline: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const owned = await db.select({ id: listings.id }).from(listings).where(eq(listings.ownerId, ctx.user!.id));
      const listingIds = owned.map((listing) => listing.id);
      if (!listingIds.length) return [];
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - 29);
      const rows = await db.select({
        day: sql<string>`DATE(${listingAnalyticsEvents.createdAt})`,
        eventType: listingAnalyticsEvents.eventType,
        total: count(),
      }).from(listingAnalyticsEvents)
        .where(and(inArray(listingAnalyticsEvents.listingId, listingIds), gte(listingAnalyticsEvents.createdAt, since)))
        .groupBy(sql`DATE(${listingAnalyticsEvents.createdAt})`, listingAnalyticsEvents.eventType)
        .orderBy(sql`DATE(${listingAnalyticsEvents.createdAt})`);
      return rows.map((row) => ({ day: String(row.day), eventType: row.eventType, total: Number(row.total) }));
    }),
    exportAnalyticsCsv: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
      const owned = await db.select({
        id: listings.id,
        title: listings.title,
        category: listings.category,
        status: listings.status,
        createdAt: listings.createdAt,
      }).from(listings).where(eq(listings.ownerId, ctx.user!.id)).orderBy(desc(listings.createdAt));
      const eventRows = owned.length
        ? await db.select({ listingId: listingAnalyticsEvents.listingId, eventType: listingAnalyticsEvents.eventType, total: count() })
          .from(listingAnalyticsEvents)
          .where(inArray(listingAnalyticsEvents.listingId, owned.map((listing) => listing.id)))
          .groupBy(listingAnalyticsEvents.listingId, listingAnalyticsEvents.eventType)
        : [];
      const counts = new Map<number, { views: number; whatsappClicks: number; contactClicks: number }>();
      for (const event of eventRows) {
        const current = counts.get(event.listingId) ?? { views: 0, whatsappClicks: 0, contactClicks: 0 };
        if (event.eventType === "view") current.views = Number(event.total);
        if (event.eventType === "whatsapp_click") current.whatsappClicks = Number(event.total);
        if (event.eventType === "contact_click") current.contactClicks = Number(event.total);
        counts.set(event.listingId, current);
      }
      const csvField = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const header = ["listing_id", "title", "category", "status", "views", "whatsapp_clicks", "contact_clicks", "total_contact_clicks", "created_at"];
      const rows = owned.map((listing) => {
        const analytics = counts.get(listing.id) ?? { views: 0, whatsappClicks: 0, contactClicks: 0 };
        return [listing.id, listing.title, listing.category, listing.status, analytics.views, analytics.whatsappClicks, analytics.contactClicks, analytics.whatsappClicks + analytics.contactClicks, listing.createdAt?.toISOString?.() ?? ""].map(csvField).join(",");
      });
      const date = new Date().toISOString().slice(0, 10);
      return { filename: `altusplace-agency-analytics-${date}.csv`, csv: `\uFEFF${header.map(csvField).join(",")}\n${rows.join("\n")}` };
    }),
  }),

  notifications: router({
    list: protectedProcedure
      .input(z.object({ unreadOnly: z.boolean().optional().default(false) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const filters = [eq(notifications.userId, ctx.user!.id)];
        if (input.unreadOnly) filters.push(isNull(notifications.readAt));
        return db.select().from(notifications)
          .where(and(...filters))
          .orderBy(desc(notifications.createdAt))
          .limit(50);
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return 0;
      const result = await db.select({ value: count() }).from(notifications)
        .where(and(eq(notifications.userId, ctx.user!.id), isNull(notifications.readAt)));
      return Number(result[0]?.value ?? 0);
    }),

    markRead: protectedProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.update(notifications)
          .set({ readAt: new Date() })
          .where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user!.id)));
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, ctx.user!.id), isNull(notifications.readAt)));
      return { success: true };
    }),
  }),

  messages: router({
    listByBooking: protectedProcedure
      .input(z.object({ bookingId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const bookingRows = await db.select({ renterId: bookings.renterId, ownerId: listings.ownerId })
          .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id))
          .where(eq(bookings.id, input.bookingId)).limit(1);
        const booking = bookingRows[0];
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "الحجز غير موجود." });
        const canRead = ctx.user!.role === "admin" || ctx.user!.id === booking.renterId || ctx.user!.id === booking.ownerId;
        if (!canRead) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك الوصول إلى رسائل هذا الحجز." });
        return db.select({ id: bookingMessages.id, bookingId: bookingMessages.bookingId, senderId: bookingMessages.senderId, recipientId: bookingMessages.recipientId, body: bookingMessages.body, readAt: bookingMessages.readAt, createdAt: bookingMessages.createdAt, senderName: users.name })
          .from(bookingMessages).leftJoin(users, eq(bookingMessages.senderId, users.id))
          .where(eq(bookingMessages.bookingId, input.bookingId)).orderBy(bookingMessages.createdAt);
      }),
    send: protectedProcedure
      .input(z.object({ bookingId: z.number().int().positive(), body: z.string().trim().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const bookingRows = await db.select({ renterId: bookings.renterId, ownerId: listings.ownerId, listingTitle: listings.title })
          .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id))
          .where(eq(bookings.id, input.bookingId)).limit(1);
        const booking = bookingRows[0];
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "الحجز غير موجود." });
        const participants = [booking.renterId, booking.ownerId];
        if (!participants.includes(ctx.user!.id)) throw new TRPCError({ code: "FORBIDDEN", message: "المراسلة متاحة فقط لأطراف الحجز." });
        const recipientId = ctx.user!.id === booking.renterId ? booking.ownerId : booking.renterId;
        const [inserted] = await db.insert(bookingMessages).values({ bookingId: input.bookingId, senderId: ctx.user!.id, recipientId, body: input.body });
        const messageId = Number(inserted.insertId);
        await safeNotifyUser({ userId: recipientId, type: "system", title: "رسالة جديدة حول الحجز / Nouveau message", message: input.body.slice(0, 180), href: `/my-bookings?booking=${input.bookingId}`, entityType: "booking_message", entityId: messageId });
        return { success: true as const, messageId };
      }),
    markRead: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        await db.update(bookingMessages).set({ readAt: new Date() }).where(and(eq(bookingMessages.id, input.messageId), eq(bookingMessages.recipientId, ctx.user!.id)));
        return { success: true as const };
      }),
  }),

  refunds: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(refundRequests).where(eq(refundRequests.requestedBy, ctx.user!.id)).orderBy(desc(refundRequests.createdAt)).limit(100);
    }),
    request: protectedProcedure
      .input(z.object({ bookingId: z.number().int().positive(), amount: z.number().int().positive(), reason: z.string().trim().min(5).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const bookingRows = await db.select({ renterId: bookings.renterId, totalPrice: bookings.totalPrice, status: bookings.status, ownerId: listings.ownerId })
          .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id)).where(eq(bookings.id, input.bookingId)).limit(1);
        const booking = bookingRows[0];
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "الحجز غير موجود." });
        if (ctx.user!.id !== booking.renterId && ctx.user!.id !== booking.ownerId && ctx.user!.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك طلب استرداد لهذا الحجز." });
        if (input.amount > booking.totalPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "مبلغ الاسترداد لا يمكن أن يتجاوز قيمة الحجز." });
        const pending = await db.select({ id: refundRequests.id }).from(refundRequests).where(and(eq(refundRequests.bookingId, input.bookingId), eq(refundRequests.status, "Pending"))).limit(1);
        if (pending.length) throw new TRPCError({ code: "CONFLICT", message: "يوجد طلب استرداد قيد المراجعة لهذا الحجز." });
        const [inserted] = await db.insert(refundRequests).values({ bookingId: input.bookingId, requestedBy: ctx.user!.id, amount: input.amount, reason: input.reason });
        const refundId = Number(inserted.insertId);
        await writeAuditLog({ actorId: ctx.user!.id, action: "refund.requested", entityType: "refund_request", entityId: refundId, afterData: { bookingId: input.bookingId, amount: input.amount, reason: input.reason } });
        return { success: true as const, refundId };
      }),
  }),

  storage: router({
    uploadAgencyLogo: ownerProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(160),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        contentBase64: z.string().min(1).max(8_500_000),
      }))
      .mutation(async ({ ctx, input }) => {
        const normalizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "agency-logo";
        const imageBuffer = Buffer.from(input.contentBase64, "base64");
        if (imageBuffer.length === 0 || imageBuffer.length > 3 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الشعار يجب ألا يتجاوز 3 ميجابايت." });
        }
        const uploaded = await storagePut(`users/${ctx.user!.id}/agency/${Date.now()}-${normalizedName}`, imageBuffer, input.mimeType);
        await getDb().then(async db => {
          if (db) await db.update(users).set({ agencyLogoUrl: uploaded.url }).where(eq(users.id, ctx.user!.id));
        });
        return { ...uploaded, fileName: normalizedName, mimeType: input.mimeType };
      }),
    uploadImage: ownerProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(160),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        contentBase64: z.string().min(1).max(8_500_000),
      }))
      .mutation(async ({ ctx, input }) => {
        const normalizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "listing-image";
        const imageBuffer = Buffer.from(input.contentBase64, "base64");
        if (imageBuffer.length === 0 || imageBuffer.length > 6 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الصورة يجب أن يكون بين 1 بايت و6 ميجابايت." });
        }
        const verification = await verifyOriginalListingImage({ base64: input.contentBase64, mimeType: input.mimeType });
        if (!verification.accepted) {
          const notificationTitle = "تم رفض صورة الإعلان / Image refusée";
          const notificationMessage = `${ORIGINAL_IMAGE_REJECTION_MESSAGE}\n\nالأسباب: ${verification.reasons.join("، ") || "لم تستوفِ الصورة معايير الأصالة."}`;
          await safeNotifyUser({
            userId: ctx.user!.id,
            type: "listing_rejected",
            title: notificationTitle,
            message: notificationMessage,
            href: "/host",
            entityType: "listing_image_verification",
            dedupeKey: `listing-image-rejected:${ctx.user!.id}:${normalizedName}:${verification.confidence}`,
            email: ctx.user!.email ? { to: ctx.user!.email, subject: notificationTitle, ...buildEmailContent(notificationTitle, notificationMessage, "/host") } : undefined,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: ORIGINAL_IMAGE_REJECTION_MESSAGE,
            cause: { confidence: verification.confidence, reasons: verification.reasons },
          });
        }
        const uploaded = await storagePut(`users/${ctx.user!.id}/listings/${Date.now()}-${normalizedName}`, imageBuffer, input.mimeType);
        const verificationProof = createImageVerificationProof({ ownerId: ctx.user!.id, url: uploaded.url, bytes: imageBuffer });
        return { ...uploaded, fileName: normalizedName, mimeType: input.mimeType, verification: { confidence: verification.confidence }, verificationProof };
      }),
  }),

  kyc: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: kycSubmissions.id,
        applicantRole: kycSubmissions.applicantRole,
        documentType: kycSubmissions.documentType,
        originalFileName: kycSubmissions.originalFileName,
        mimeType: kycSubmissions.mimeType,
        status: kycSubmissions.status,
        rejectionReason: kycSubmissions.rejectionReason,
        submittedAt: kycSubmissions.submittedAt,
        reviewedAt: kycSubmissions.reviewedAt,
      }).from(kycSubmissions).where(eq(kycSubmissions.userId, ctx.user!.id)).orderBy(desc(kycSubmissions.submittedAt));
    }),
    status: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        return {
          status: "unverified" as const,
          kycVerifiedAt: null,
          requiredDocuments: { car: ["driving_license"], property: ["national_id", "cni", "passport"] },
          approvedDocumentTypes: [] as string[],
          pendingCount: 0,
          lastRejectionReason: null,
        };
      }
      return getKycStatusPayload({ db, userId: ctx.user!.id });
    }),
    submit: protectedProcedure
      .input(z.object({
        applicantRole: z.enum(["renter", "owner", "company"]),
        documentType: z.enum(["commercial_register", "cni", "driving_license", "passport", "national_id"]),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
        contentBase64: z.string().min(1).max(12_000_000),
        documentNumber: z.string().trim().min(4).max(32).optional(),
        expiryDate: z.string().optional(),
        categoryContext: z.enum(["car", "property"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const existing = await db.select({ id: kycSubmissions.id }).from(kycSubmissions)
          .where(and(eq(kycSubmissions.userId, ctx.user!.id), eq(kycSubmissions.status, "Pending"))).limit(1);
        if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "لديك طلب تحقق قيد المراجعة بالفعل." });
        const bytes = Buffer.from(input.contentBase64, "base64");
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم المستند يجب ألا يتجاوز 8 ميجابايت." });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180) || "identity-document";
        const stored = await storagePut(`users/${ctx.user!.id}/kyc/${Date.now()}-${safeName}`, bytes, input.mimeType);
        const [created] = await db.insert(kycSubmissions).values({
          userId: ctx.user!.id,
          applicantRole: input.applicantRole,
          documentType: input.documentType,
          documentKey: stored.key,
          originalFileName: input.fileName,
          mimeType: input.mimeType,
          status: "Pending",
          ...(input.documentNumber ? { documentNumberMasked: maskDocumentNumber(input.documentNumber) } : {}),
          ...(input.expiryDate ? { expiryDate: new Date(input.expiryDate) } : {}),
          ...(input.categoryContext ? { categoryContext: input.categoryContext } : {}),
        }).$returningId();
        await db.update(users).set({ kycVerificationStatus: "pending" }).where(eq(users.id, ctx.user!.id));
        return { id: created.id, status: "Pending" as const };
      }),
    adminList: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(kycSubmissions).orderBy(desc(kycSubmissions.submittedAt)).limit(100);
    }),
    review: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["Approved", "Rejected"]), rejectionReason: z.string().trim().max(500).optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [submission] = await db.select({ userId: kycSubmissions.userId }).from(kycSubmissions).where(eq(kycSubmissions.id, input.id)).limit(1);
        await db.update(kycSubmissions).set({ status: input.status, rejectionReason: input.status === "Rejected" ? (input.rejectionReason || "لم يتم تقديم سبب.") : null, reviewedAt: new Date() }).where(eq(kycSubmissions.id, input.id));
        if (submission) {
          const userStatus = input.status === "Approved" ? "verified" : "rejected";
          await db.update(users).set({ kycVerificationStatus: userStatus, ...(input.status === "Approved" ? { kycVerifiedAt: new Date() } : {}) }).where(eq(users.id, submission.userId));
        }
        return { success: true } as const;
      }),
    getByUserId: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [userRow] = await db.select({ kycVerificationStatus: users.kycVerificationStatus, kycVerifiedAt: users.kycVerifiedAt }).from(users).where(eq(users.id, input.userId)).limit(1);
        return userRow ?? null;
      }),
  }),
  admin: router({
    auditLogs: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: auditLogs.id, actorId: auditLogs.actorId, actorName: users.name, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, beforeData: auditLogs.beforeData, afterData: auditLogs.afterData, createdAt: auditLogs.createdAt })
        .from(auditLogs).leftJoin(users, eq(auditLogs.actorId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(200);
    }),
    refundRequests: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: refundRequests.id, bookingId: refundRequests.bookingId, requestedBy: refundRequests.requestedBy, requesterName: users.name, amount: refundRequests.amount, reason: refundRequests.reason, status: refundRequests.status, adminNote: refundRequests.adminNote, reviewedBy: refundRequests.reviewedBy, createdAt: refundRequests.createdAt, reviewedAt: refundRequests.reviewedAt })
        .from(refundRequests).leftJoin(users, eq(refundRequests.requestedBy, users.id)).orderBy(desc(refundRequests.createdAt)).limit(200);
    }),
    reviewRefund: adminProcedure
      .input(z.object({ refundId: z.number().int().positive(), status: z.enum(["Approved", "Rejected", "Paid"]), adminNote: z.string().trim().max(2000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const current = await db.select().from(refundRequests).where(eq(refundRequests.id, input.refundId)).limit(1);
        if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "طلب الاسترداد غير موجود." });
        await db.update(refundRequests).set({ status: input.status, adminNote: input.adminNote || null, reviewedBy: ctx.user!.id, reviewedAt: new Date() }).where(eq(refundRequests.id, input.refundId));
        await writeAuditLog({ actorId: ctx.user!.id, action: "refund.reviewed", entityType: "refund_request", entityId: input.refundId, beforeData: current[0], afterData: { ...current[0], status: input.status, adminNote: input.adminNote || null } });
        await safeNotifyUser({ userId: current[0].requestedBy, type: "system", title: "تحديث طلب الاسترداد / Mise à jour du remboursement", message: `تم تحديث طلب الاسترداد #${input.refundId} إلى حالة ${input.status}.`, href: "/my-bookings", entityType: "refund_request", entityId: input.refundId });
        return { success: true as const };
      }),
    overview: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { users: 0, owners: 0, renters: 0, activeAgencies: 0, listings: 0, pendingListings: 0, bookings: 0, grossRevenue: 0, platformFees: 0, userGrowth: 0, monthlyRevenue: [] };
      const [userRows, ownerRows, renterRows, activeAgencyRows, listingRows, pendingRows, bookingRows, revenueRows, recentUsers] = await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(users).where(eq(users.role, 'owner')),
        db.select({ value: count() }).from(users).where(eq(users.role, 'renter')),
        db.select({ value: count() }).from(users).where(and(eq(users.role, 'owner'), eq(users.accountStatus, 'active'))),
        db.select({ value: count() }).from(listings),
        db.select({ value: count() }).from(listings).where(eq(listings.status, 'Published')),
        db.select({ value: count() }).from(bookings),
        db.select({ gross: bookings.totalPrice, fees: bookings.commissionFee }).from(bookings).where(eq(bookings.status, 'Confirmed')),
        db.select({ createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100),
      ]);
      return {
        users: Number(userRows[0]?.value ?? 0), owners: Number(ownerRows[0]?.value ?? 0), renters: Number(renterRows[0]?.value ?? 0), activeAgencies: Number(activeAgencyRows[0]?.value ?? 0),
        listings: Number(listingRows[0]?.value ?? 0), pendingListings: Number(pendingRows[0]?.value ?? 0), bookings: Number(bookingRows[0]?.value ?? 0),
        grossRevenue: revenueRows.reduce((sum, row) => sum + row.gross, 0), platformFees: revenueRows.reduce((sum, row) => sum + row.fees, 0),
        userGrowth: recentUsers.filter(user => user.createdAt && user.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
        monthlyRevenue: [],
      };
    }),
    users: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, vendorTier: users.vendorTier, accountStatus: users.accountStatus, kycVerificationStatus: users.kycVerificationStatus, agencyName: users.agencyName, commercialRegister: users.commercialRegister, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(200);
    }),
    updateUserStatus: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), status: z.enum(['active', 'suspended', 'banned']) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        if (input.userId === ctx.user.id && input.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تعطيل حسابك الإداري.' });
        const [before] = await db.select({ accountStatus: users.accountStatus }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود.' });
        await db.update(users).set({ accountStatus: input.status }).where(eq(users.id, input.userId));
        await writeAuditLog({ actorId: ctx.user.id, action: `user.${input.status}`, entityType: 'user', entityId: input.userId, beforeData: before, afterData: { accountStatus: input.status } });
        return { success: true as const };
      }),
    updateUserRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(['renter', 'owner', 'admin', 'user', 'SUPER_ADMIN']) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        return { success: true };
      }),
    bookings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: bookings.id, status: bookings.status, totalPrice: bookings.totalPrice, commissionFee: bookings.commissionFee, startDate: bookings.startDate, endDate: bookings.endDate, listingTitle: listings.title, renterName: users.name })
        .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id)).leftJoin(users, eq(bookings.renterId, users.id)).orderBy(desc(bookings.createdAt)).limit(200);
    }),
    cancelBooking: adminProcedure
      .input(z.object({ bookingId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const before = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
        await db.update(bookings).set({ status: 'Cancelled' }).where(eq(bookings.id, input.bookingId));
        await writeAuditLog({ actorId: ctx.user!.id, action: "booking.cancelled", entityType: "booking", entityId: input.bookingId, beforeData: before[0], afterData: { ...before[0], status: "Cancelled" } });
        return { success: true };
      }),
    listings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: listings.id, title: listings.title, category: listings.category, status: listings.status, isFeatured: listings.isFeatured, pricePerDay: listings.pricePerDay, ownerId: listings.ownerId, ownerName: users.name, createdAt: listings.createdAt })
        .from(listings).leftJoin(users, eq(listings.ownerId, users.id)).orderBy(desc(listings.createdAt)).limit(200);
    }),
    moderateListing: adminProcedure
      .input(z.object({ listingId: z.number().int().positive(), status: z.enum(['Published', 'Approved', 'Rejected']), isFeatured: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const [before] = await db.select({ status: listings.status, isFeatured: listings.isFeatured }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'الإعلان غير موجود.' });
        await db.update(listings).set({ status: input.status, ...(input.isFeatured === undefined ? {} : { isFeatured: input.isFeatured }) }).where(eq(listings.id, input.listingId));
        await writeAuditLog({ actorId: ctx.user.id, action: 'listing.moderated', entityType: 'listing', entityId: input.listingId, beforeData: before, afterData: { status: input.status, isFeatured: input.isFeatured ?? before.isFeatured } });
        return { success: true as const };
      }),
    updateListing: adminProcedure
      .input(z.object({ listingId: z.number().int().positive(), title: z.string().trim().min(2).max(255), pricePerDay: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const [before] = await db.select({ title: listings.title, pricePerDay: listings.pricePerDay }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'الإعلان غير موجود.' });
        await db.update(listings).set({ title: input.title, pricePerDay: input.pricePerDay }).where(eq(listings.id, input.listingId));
        await writeAuditLog({ actorId: ctx.user.id, action: 'listing.updated', entityType: 'listing', entityId: input.listingId, beforeData: before, afterData: input });
        return { success: true as const };
      }),
    deleteListing: adminProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const [before] = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'الإعلان غير موجود.' });
        await db.delete(listings).where(eq(listings.id, input.listingId));
        await writeAuditLog({ actorId: ctx.user.id, action: 'listing.deleted', entityType: 'listing', entityId: input.listingId, beforeData: before });
        return { success: true as const };
      }),
    commissionSettings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { commissionRateBasisPoints: 1000, vatRateBasisPoints: 2000, platformName: 'ALTUSplace', contactEmail: '', contactPhone: '', maintenanceMode: false };
      const rows = await db.select().from(platformSettings).limit(1);
      return rows[0] ?? { commissionRateBasisPoints: 1000, vatRateBasisPoints: 2000, platformName: 'ALTUSplace', contactEmail: '', contactPhone: '', maintenanceMode: false };
    }),
    updateCommission: adminProcedure
      .input(z.object({ commissionRateBasisPoints: z.number().int().min(0).max(3000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const existing = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
        if (existing[0]) {
          await db.update(platformSettings).set({ commissionRateBasisPoints: input.commissionRateBasisPoints, updatedBy: ctx.user.id }).where(eq(platformSettings.id, existing[0].id));
        } else {
          await db.insert(platformSettings).values({ commissionRateBasisPoints: input.commissionRateBasisPoints, updatedBy: ctx.user.id });
        }
        return { success: true, commissionRateBasisPoints: input.commissionRateBasisPoints };
      }),
    updatePlatformSettings: adminProcedure
      .input(z.object({ platformName: z.string().trim().min(2).max(180), contactEmail: z.string().trim().email().or(z.literal('')), contactPhone: z.string().trim().max(40), maintenanceMode: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const existing = await db.select().from(platformSettings).limit(1);
        if (existing[0]) await db.update(platformSettings).set({ ...input, updatedBy: ctx.user.id }).where(eq(platformSettings.id, existing[0].id));
        else await db.insert(platformSettings).values({ ...input, updatedBy: ctx.user.id });
        await writeAuditLog({ actorId: ctx.user.id, action: 'platform.settings.updated', entityType: 'platform_settings', beforeData: existing[0], afterData: input });
        return { success: true as const };
      }),
    payouts: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: payoutRequests.id, ownerId: payoutRequests.ownerId, ownerName: users.name, ownerEmail: users.email, amount: payoutRequests.amount, method: payoutRequests.method, status: payoutRequests.status, reference: payoutRequests.reference, adminNote: payoutRequests.adminNote, createdAt: payoutRequests.createdAt, reviewedAt: payoutRequests.reviewedAt })
        .from(payoutRequests).leftJoin(users, eq(payoutRequests.ownerId, users.id)).orderBy(desc(payoutRequests.createdAt)).limit(200);
    }),
    reviewPayout: adminProcedure
      .input(z.object({ payoutId: z.number().int().positive(), status: z.enum(['Approved', 'Paid', 'Rejected']), adminNote: z.string().max(1000).optional(), reference: z.string().max(120).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        await db.update(payoutRequests).set({ status: input.status, adminNote: input.adminNote, reference: input.reference, reviewedBy: ctx.user!.id, reviewedAt: new Date() }).where(eq(payoutRequests.id, input.payoutId));
        return { success: true };
      }),
    payments: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: payments.id, bookingId: payments.bookingId, payerId: payments.payerId, payerName: users.name, payerEmail: users.email, method: payments.method, status: payments.status, amount: payments.amount, currency: payments.currency, providerReference: payments.providerReference, simulated: payments.simulated, createdAt: payments.createdAt })
        .from(payments).leftJoin(users, eq(payments.payerId, users.id)).orderBy(desc(payments.createdAt)).limit(200);
    }),
    disputes: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: disputes.id, bookingId: disputes.bookingId, openedBy: disputes.openedBy, type: disputes.type, description: disputes.description, status: disputes.status, resolutionNote: disputes.resolutionNote, createdAt: disputes.createdAt, openerName: users.name })
        .from(disputes).leftJoin(users, eq(disputes.openedBy, users.id)).orderBy(desc(disputes.createdAt)).limit(200);
    }),
    supportTickets: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: supportTickets.id, userId: supportTickets.userId, subject: supportTickets.subject, category: supportTickets.category, description: supportTickets.description, status: supportTickets.status, lastResponse: supportTickets.lastResponse, respondedAt: supportTickets.respondedAt, createdAt: supportTickets.createdAt, userName: users.name, userEmail: users.email })
        .from(supportTickets).leftJoin(users, eq(supportTickets.userId, users.id)).orderBy(desc(supportTickets.createdAt)).limit(200);
    }),
    updateSupportTicket: adminProcedure
      .input(z.object({ ticketId: z.number().int().positive(), status: z.enum(["Open", "InProgress", "Resolved"]), response: z.string().max(2000).optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.update(supportTickets).set({ status: input.status, ...(input.response ? { lastResponse: input.response, respondedAt: new Date() } : {}) }).where(eq(supportTickets.id, input.ticketId));
        return { success: true };
      }),
    resolveDispute: adminProcedure
      .input(z.object({ disputeId: z.number().int().positive(), status: z.enum(['UnderReview', 'Resolved', 'Rejected']), resolutionNote: z.string().min(2).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        await db.update(disputes).set({ status: input.status, resolutionNote: input.resolutionNote, reviewedBy: ctx.user.id, updatedAt: new Date() }).where(eq(disputes.id, input.disputeId));
        return { success: true };
      }),
    super: router({
      financialOverview: superAdminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return { grossBookingValue: 0, netPlatformRevenue: 0, activeEscrowBalance: 0, totalRefundedVolume: 0, confirmedBookings: 0, activeEscrowEntries: 0, propertyGbv: 0, carGbv: 0, propertyNet: 0, carNet: 0 };
        const [confirmedRows, escrowRows, refundRows] = await Promise.all([
          db.select({ totalPrice: bookings.totalPrice, commissionFee: bookings.commissionFee, category: listings.category })
            .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id))
            .where(eq(bookings.status, 'Confirmed')),
          db.select({ totalPaid: escrowEntries.totalPaid, status: escrowEntries.status }).from(escrowEntries),
          db.select({ amount: refundRequests.amount }).from(refundRequests)
            .where(inArray(refundRequests.status, ['Approved', 'Paid'])),
        ]);
        const activeStatuses = ['held', 'releasable', 'frozen'];
        const activeEscrows = escrowRows.filter(row => activeStatuses.includes(row.status));
        const propertyRows = confirmedRows.filter(row => row.category === 'real_estate');
        const carRows = confirmedRows.filter(row => row.category && row.category !== 'real_estate');
        return {
          grossBookingValue: confirmedRows.reduce((sum, row) => sum + row.totalPrice, 0),
          netPlatformRevenue: confirmedRows.reduce((sum, row) => sum + row.commissionFee, 0),
          activeEscrowBalance: activeEscrows.reduce((sum, row) => sum + row.totalPaid, 0),
          totalRefundedVolume: refundRows.reduce((sum, row) => sum + row.amount, 0),
          confirmedBookings: confirmedRows.length,
          activeEscrowEntries: activeEscrows.length,
          propertyGbv: propertyRows.reduce((sum, row) => sum + row.totalPrice, 0),
          carGbv: carRows.reduce((sum, row) => sum + row.totalPrice, 0),
          propertyNet: propertyRows.reduce((sum, row) => sum + row.commissionFee, 0),
          carNet: carRows.reduce((sum, row) => sum + row.commissionFee, 0),
        };
      }),
      revenueSeries: superAdminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        const [rows, refundRows] = await Promise.all([
          db.select({ totalPrice: bookings.totalPrice, commissionFee: bookings.commissionFee, createdAt: bookings.createdAt, category: listings.category })
            .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id))
            .where(eq(bookings.status, 'Confirmed')),
          db.select({ amount: refundRequests.amount, createdAt: refundRequests.createdAt }).from(refundRequests)
            .where(inArray(refundRequests.status, ['Approved', 'Paid'])),
        ]);
        const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const now = new Date();
        const buckets: Array<{ key: string; label: string; gbv: number; net: number; refunds: number; propertyGbv: number; carGbv: number; propertyNet: number; carNet: number }> = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = monthKey(d);
          buckets.push({ key, label: key, gbv: 0, net: 0, refunds: 0, propertyGbv: 0, carGbv: 0, propertyNet: 0, carNet: 0 });
        }
        for (const row of rows) {
          if (!row.createdAt) continue;
          const bucket = buckets.find(b => b.key === monthKey(new Date(row.createdAt)));
          if (!bucket) continue;
          const isProperty = row.category === 'real_estate';
          bucket.gbv += row.totalPrice;
          bucket.net += row.commissionFee;
          if (isProperty) { bucket.propertyGbv += row.totalPrice; bucket.propertyNet += row.commissionFee; }
          else { bucket.carGbv += row.totalPrice; bucket.carNet += row.commissionFee; }
        }
        for (const row of refundRows) {
          if (!row.createdAt) continue;
          const bucket = buckets.find(b => b.key === monthKey(new Date(row.createdAt)));
          if (bucket) bucket.refunds += row.amount;
        }
        return buckets;
      }),
      escrowLedger: superAdminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        const guest = alias(users, "guest");
        const vendor = alias(users, "vendor");
        return db.select({
          id: escrowEntries.id,
          bookingId: escrowEntries.bookingId,
          guestId: escrowEntries.guestId,
          guestName: guest.name,
          vendorId: escrowEntries.vendorId,
          vendorName: vendor.name,
          listingTitle: listings.title,
          listingCategory: escrowEntries.listingCategory,
          totalPaid: escrowEntries.totalPaid,
          platformCut: escrowEntries.platformCut,
          vendorPayoutShare: escrowEntries.vendorPayoutShare,
          releaseDate: escrowEntries.releaseDate,
          stripeTransferStatus: escrowEntries.stripeTransferStatus,
          stripeTransferId: escrowEntries.stripeTransferId,
          status: escrowEntries.status,
          mediationNote: escrowEntries.mediationNote,
          createdAt: escrowEntries.createdAt,
        }).from(escrowEntries)
          .innerJoin(bookings, eq(escrowEntries.bookingId, bookings.id))
          .leftJoin(guest, eq(escrowEntries.guestId, guest.id))
          .leftJoin(vendor, eq(escrowEntries.vendorId, vendor.id))
          .leftJoin(listings, eq(bookings.listingId, listings.id))
          .orderBy(desc(escrowEntries.createdAt))
          .limit(500);
      }),
      getCommission: superAdminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return { global: { mode: 'percent' as const, percentBasisPoints: 1000, flatAmount: 0 }, tiers: [], tierDistribution: {} };
        const global = await getGlobalCommission(db);
        const tiers: Array<{ tier: string; mode: 'percent' | 'flat'; percentBasisPoints: number; flatAmount: number; active: boolean }> = [];
        for (const tier of VENDOR_TIERS) {
          const override = await getTierCommission(db, tier);
          tiers.push({ tier, ...(override ?? { mode: 'percent', percentBasisPoints: 1000, flatAmount: 0 }), active: Boolean(override) });
        }
        const distRows = await db.select({ tier: users.vendorTier, total: count() }).from(users).groupBy(users.vendorTier);
        return {
          global,
          tiers,
          tierDistribution: distRows.reduce<Record<string, number>>((acc, row) => { acc[row.tier] = Number(row.total); return acc; }, {}),
        };
      }),
      updateGlobalCommission: superAdminProcedure
        .input(z.object({ mode: z.enum(['percent', 'flat']), percentBasisPoints: z.number().int().min(0).max(10000).optional(), flatAmount: z.number().int().min(0).max(1000000000).optional() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const before = await getGlobalCommission(db);
          const updated = await upsertGlobalCommission(db, input, ctx.user!.id);
          await writeAuditLog({ actorId: ctx.user!.id, action: 'commission.global.updated', entityType: 'platform_settings', beforeData: before, afterData: updated });
          return { success: true as const, updated };
        }),
      updateTierCommission: superAdminProcedure
        .input(z.object({ tier: z.enum(VENDOR_TIERS), mode: z.enum(['percent', 'flat']), percentBasisPoints: z.number().int().min(0).max(10000).optional(), flatAmount: z.number().int().min(0).max(1000000000).optional() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const before = await getTierCommission(db, input.tier);
          const updated = await upsertTierCommission(db, input, ctx.user!.id);
          await writeAuditLog({ actorId: ctx.user!.id, action: `commission.tier.${input.tier}.updated`, entityType: 'commission_tier', beforeData: before, afterData: { tier: input.tier, ...updated } });
          return { success: true as const, updated };
        }),
      updateVendorTier: superAdminProcedure
        .input(z.object({ userId: z.number().int().positive(), tier: z.enum(VENDOR_TIERS) }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const [vendor] = await db.select({ id: users.id, vendorTier: users.vendorTier }).from(users).where(eq(users.id, input.userId)).limit(1);
          if (!vendor) throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود.' });
          await db.update(users).set({ vendorTier: input.tier }).where(eq(users.id, input.userId));
          await writeAuditLog({ actorId: ctx.user!.id, action: 'commission.tier.assigned', entityType: 'user', entityId: input.userId, beforeData: { vendorTier: vendor.vendorTier }, afterData: { vendorTier: input.tier } });
          return { success: true as const, vendorTier: input.tier };
        }),
      forceHoldPayout: superAdminProcedure
        .input(z.object({ escrowId: z.number().int().positive(), reason: z.string().trim().max(500).optional() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const [entry] = await db.select({ id: escrowEntries.id, bookingId: escrowEntries.bookingId, vendorId: escrowEntries.vendorId, status: escrowEntries.status }).from(escrowEntries).where(eq(escrowEntries.id, input.escrowId)).limit(1);
          if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'السجل الإسكرو غير موجود.' });
          const outcome = await freezeEscrowEntry(db, input.escrowId);
          if (!outcome.frozen) throw new TRPCError({ code: 'BAD_REQUEST', message: outcome.message });
          await writeAuditLog({ actorId: ctx.user!.id, action: 'escrow.frozen', entityType: 'escrow', entityId: input.escrowId, beforeData: { status: entry.status }, afterData: { status: 'frozen', reason: input.reason ?? null } });
          await safeNotifyUser({ userId: entry.vendorId, type: "system", title: "تجميد دفع مؤقت / Paiement gelé", message: `تم تجميد دفع الحجز #${entry.bookingId} مؤقتاً. ${input.reason ?? ''}`, href: "/host", entityType: "escrow", entityId: input.escrowId });
          return { success: true as const, message: outcome.message };
        }),
      releaseEscrow: superAdminProcedure
        .input(z.object({ escrowId: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const [entry] = await db.select({ id: escrowEntries.id, status: escrowEntries.status }).from(escrowEntries).where(eq(escrowEntries.id, input.escrowId)).limit(1);
          if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'السجل الإسكرو غير موجود.' });
          const outcome = await releaseEscrowEntry(db, input.escrowId);
          if (!outcome.released) throw new TRPCError({ code: 'BAD_REQUEST', message: outcome.message });
          await writeAuditLog({ actorId: ctx.user!.id, action: 'escrow.released', entityType: 'escrow', entityId: input.escrowId, beforeData: { status: entry.status }, afterData: { status: 'releasable' } });
          return { success: true as const, message: outcome.message };
        }),
      mediateDispute: superAdminProcedure
        .input(z.object({ escrowId: z.number().int().positive(), resolution: z.enum(['release_to_vendor', 'refund_to_guest']), mediationNote: z.string().trim().min(2).max(2000) }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const [entry] = await db.select({ id: escrowEntries.id, bookingId: escrowEntries.bookingId, vendorId: escrowEntries.vendorId, status: escrowEntries.status }).from(escrowEntries).where(eq(escrowEntries.id, input.escrowId)).limit(1);
          if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'السجل الإسكرو غير موجود.' });
          const outcome = await mediateEscrowEntry(db, input.escrowId, input.resolution, input.mediationNote);
          if (!outcome.mediated) throw new TRPCError({ code: 'BAD_REQUEST', message: outcome.message });
          await writeAuditLog({ actorId: ctx.user!.id, action: `escrow.mediated.${input.resolution}`, entityType: 'escrow', entityId: input.escrowId, beforeData: { status: entry.status }, afterData: { status: 'mediated', resolution: input.resolution, mediationNote: input.mediationNote } });
          await safeNotifyUser({ userId: entry.vendorId, type: "system", title: "نزاع محلول / Litige résolu", message: `تم حسم النزاع الخاص بالحجز #${entry.bookingId}: ${input.resolution === 'release_to_vendor' ? 'تسوية لصالح المزوّد' : 'تسوية لصالح الضيف'}.`, href: "/host", entityType: "escrow", entityId: input.escrowId });
          return { success: true as const, message: outcome.message };
        }),
    }),
    ownerFinancials: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { gross: 0, platformFees: 0, net: 0, requested: 0, paid: 0 };
      const rows = await db.select({ totalPrice: bookings.totalPrice, commissionFee: bookings.commissionFee, netProfit: bookings.netProfit })
        .from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id))
        .where(and(eq(listings.ownerId, ctx.user!.id), eq(bookings.status, 'Confirmed')));
      const payouts = await db.select({ amount: payoutRequests.amount, status: payoutRequests.status }).from(payoutRequests).where(eq(payoutRequests.ownerId, ctx.user!.id));
      return {
        gross: rows.reduce((sum, row) => sum + row.totalPrice, 0),
        platformFees: rows.reduce((sum, row) => sum + row.commissionFee, 0),
        net: rows.reduce((sum, row) => sum + row.netProfit, 0),
        requested: payouts.filter(p => p.status === 'Pending' || p.status === 'Approved').reduce((sum, p) => sum + p.amount, 0),
        paid: payouts.filter(p => p.status === 'Paid').reduce((sum, p) => sum + p.amount, 0),
      };
    }),
  }),

  supportTickets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: supportTickets.id, subject: supportTickets.subject, category: supportTickets.category, description: supportTickets.description, status: supportTickets.status, lastResponse: supportTickets.lastResponse, respondedAt: supportTickets.respondedAt, createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt })
        .from(supportTickets).where(eq(supportTickets.userId, ctx.user!.id)).orderBy(desc(supportTickets.createdAt)).limit(100);
    }),
    create: protectedProcedure
      .input(z.object({ subject: z.string().trim().min(3).max(255), category: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(5000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const [inserted] = await db.insert(supportTickets).values({ userId: ctx.user!.id, subject: input.subject, category: input.category, description: input.description, status: "Open" });
        const ticketId = Number(inserted.insertId);
        const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(20);
        await Promise.all(admins.filter(admin => admin.id !== ctx.user!.id).map(admin => safeNotifyUser({
          userId: admin.id,
          type: "system",
          title: "تذكرة دعم جديدة / Nouveau ticket",
          message: `تم فتح تذكرة دعم جديدة: ${input.subject}`,
          href: "/admin",
          entityType: "support_ticket",
          entityId: ticketId,
        })));
        return { success: true, ticketId };
      }),
  }),

  disputes: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({ id: disputes.id, bookingId: disputes.bookingId, type: disputes.type, description: disputes.description, status: disputes.status, resolutionNote: disputes.resolutionNote, createdAt: disputes.createdAt, updatedAt: disputes.updatedAt })
        .from(disputes).where(eq(disputes.openedBy, ctx.user!.id)).orderBy(desc(disputes.createdAt)).limit(100);
      if (!rows.length) return [];
      const attachments = await db.select({ id: disputeAttachments.id, disputeId: disputeAttachments.disputeId, originalFileName: disputeAttachments.originalFileName, fileKey: disputeAttachments.fileKey, mimeType: disputeAttachments.mimeType, fileSize: disputeAttachments.fileSize })
        .from(disputeAttachments).where(inArray(disputeAttachments.disputeId, rows.map(row => row.id)));
      return rows.map(row => ({ ...row, attachments: attachments.filter(file => file.disputeId === row.id).map(file => ({ id: file.id, name: file.originalFileName, mimeType: file.mimeType, size: file.fileSize, url: `/manus-storage/${file.fileKey}` })) }));
    }),
    create: protectedProcedure
      .input(z.object({ bookingId: z.number().int().positive(), type: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(5000), attachments: z.array(z.object({ name: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(100), contentBase64: z.string().max(14000000) })).max(5).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const booking = await db.select({ id: bookings.id, renterId: bookings.renterId, listingId: bookings.listingId }).from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
        if (!booking[0]) throw new Error("الحجز المرتبط بالنزاع غير موجود.");
        const listing = await db.select({ ownerId: listings.ownerId, title: listings.title }).from(listings).where(eq(listings.id, booking[0].listingId)).limit(1);
        const canOpen = ctx.user!.role === "admin" || booking[0].renterId === ctx.user!.id || listing[0]?.ownerId === ctx.user!.id;
        if (!canOpen) throw new Error("لا يمكنك فتح نزاع حول حجز لا يخصك.");
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        const files = input.attachments ?? [];
        if (files.some(file => !allowedTypes.includes(file.mimeType))) throw new Error("نوع ملف مرفق غير مدعوم.");
        const totalBytes = files.reduce((total, file) => total + Math.floor(file.contentBase64.length * 0.75), 0);
        if (totalBytes > 10 * 1024 * 1024) throw new Error("إجمالي المرفقات يتجاوز 10 ميجابايت.");
        const [inserted] = await db.insert(disputes).values({ bookingId: input.bookingId, openedBy: ctx.user!.id, type: input.type, description: input.description, status: "Open" });
        const disputeId = Number(inserted.insertId);
        for (const file of files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const uploaded = await storagePut(`disputes/${disputeId}/${safeName}`, Buffer.from(file.contentBase64, "base64"), file.mimeType);
          await db.insert(disputeAttachments).values({ disputeId, fileKey: uploaded.key, originalFileName: file.name, mimeType: file.mimeType, fileSize: Math.floor(file.contentBase64.length * 0.75) });
        }
        const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(20);
        await Promise.all(admins.filter(admin => admin.id !== ctx.user!.id).map(admin => safeNotifyUser({
          userId: admin.id,
          type: "system",
          title: "نزاع جديد / Nouveau litige",
          message: `تم فتح نزاع جديد مرتبط بالحجز #${input.bookingId}.`,
          href: "/admin",
          entityType: "dispute",
          entityId: disputeId,
        })));
        return { success: true, disputeId };
      }),
  }),

  payouts: router({
    request: ownerProcedure
      .input(z.object({ amount: z.number().int().positive(), method: z.enum(['bank_transfer', 'cash_plus', 'wafacash']) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const rows = await db.select({ netProfit: bookings.netProfit }).from(bookings).innerJoin(listings, eq(bookings.listingId, listings.id)).where(and(eq(listings.ownerId, ctx.user!.id), eq(bookings.status, 'Confirmed')));
        const previous = await db.select({ amount: payoutRequests.amount, status: payoutRequests.status }).from(payoutRequests).where(eq(payoutRequests.ownerId, ctx.user!.id));
        const available = rows.reduce((sum, row) => sum + row.netProfit, 0) - previous.filter(p => p.status !== 'Rejected').reduce((sum, p) => sum + p.amount, 0);
        if (input.amount > available) throw new Error('Requested amount exceeds available owner balance');
        await db.insert(payoutRequests).values({ ownerId: ctx.user!.id, amount: input.amount, method: input.method });
        return { success: true };
      }),
  }),
  listings: router({
    list: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const allListings = await db.select({ listing: listings, ownerName: users.name }).from(listings).leftJoin(users, eq(listings.ownerId, users.id)).where(inArray(listings.status, ['Published', 'Available', 'Approved'])).orderBy(desc(listings.createdAt));
        const requestedRange = input?.startDate && input?.endDate ? parseDateRange(input.startDate, input.endDate) : null;
        const confirmedRanges = requestedRange
          ? await db.select({ listingId: bookings.listingId, start: bookings.startDate, end: bookings.endDate }).from(bookings).where(eq(bookings.status, "Confirmed"))
          : [];

        // Dynamic Pricing Engine calculation
        return allListings.filter(({ listing: item }) => {
          if (!requestedRange) return true;
          const blockedRanges = [
            ...parseBlockedRanges(item.availability),
            ...parseBlockedRanges(item.icalImportedRanges),
            ...confirmedRanges.filter((range) => range.listingId === item.id).map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
          ];
          return isRangeAvailable(requestedRange, blockedRanges);
        }).map(({ listing: item, ownerName }) => {
          let adjustedPrice = item.pricePerDay;
          if (requestedRange) {
            const { start, end } = requestedRange;
            const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

            // Weekend surge (Friday/Saturday)
            const dayOfWeek = start.getDay();
            if (dayOfWeek === 5 || dayOfWeek === 6) {
              adjustedPrice = Math.round(adjustedPrice * 1.20); // 20% weekend surge
            }

            // Long-stay discount
            if (days > 30) {
              adjustedPrice = Math.round(adjustedPrice * 0.80); // 20% off for > 1 month
            } else if (days > 7) {
              adjustedPrice = Math.round(adjustedPrice * 0.90); // 10% off for > 7 days
            }
          }
          return {
            ...item,
            ownerName: ownerName ?? null,
            dynamicPricePerDay: adjustedPrice,
          };
        });
      }),

    trackEvent: publicProcedure
      .input(z.object({ listingId: z.number().int().positive(), eventType: z.enum(["view", "whatsapp_click", "contact_click"]), visitorKey: z.string().trim().min(16).max(128).optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { recorded: false as const };
        const listing = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.id, input.listingId), inArray(listings.status, ["Published", "Available", "Approved"]))).limit(1);
        if (!listing[0]) return { recorded: false as const };
        if (input.eventType === "view" && input.visitorKey) {
          const previous = await db.select({ id: listingAnalyticsEvents.id }).from(listingAnalyticsEvents).where(and(eq(listingAnalyticsEvents.listingId, input.listingId), eq(listingAnalyticsEvents.eventType, "view"), eq(listingAnalyticsEvents.visitorKey, input.visitorKey))).limit(1);
          if (previous[0]) return { recorded: false as const, reason: "duplicate" as const };
        }
        await db.insert(listingAnalyticsEvents).values({ listingId: input.listingId, eventType: input.eventType, visitorKey: input.visitorKey ?? null });
        return { recorded: true as const };
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number(), language: z.enum(["ar", "fr", "en"]).optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          console.error('Database unavailable in getById query for listing ID:', input.id);
          return null;
        }
        const result = await db.select().from(listings).where(and(eq(listings.id, input.id), inArray(listings.status, ['Published', 'Available', 'Approved']))).limit(1);
        if (!result[0]) {
          console.error(`Listing not found or not accessible. ID: ${input.id}, Status check: ['Published', 'Available', 'Approved']`);
          const fullListing = await db.select({ id: listings.id, status: listings.status }).from(listings).where(eq(listings.id, input.id)).limit(1);
          console.error(`Full listing debug - ID: ${input.id}, Actual status: ${fullListing[0]?.status || 'Not found'}`);
          return null;
        }

        const listing = result[0];
        const sourceLanguage = "ar" as const;
        const targetLanguage = input.language ?? sourceLanguage;

        // If translation requested and different from source, fetch translations
        if (targetLanguage !== sourceLanguage && isTranslationAvailable() && listing.title) {
          const translated = await getTranslatedListing(
            { id: listing.id, title: listing.title, description: listing.description ?? null },
            targetLanguage,
            sourceLanguage
          );
          return {
            ...listing,
            title: translated.title ?? listing.title,
            description: translated.description ?? listing.description,
            _translationMeta: {
              titleFromCache: translated.titleFromCache,
              descriptionFromCache: translated.descriptionFromCache,
              titleProvider: translated.titleProvider,
              descriptionProvider: translated.descriptionProvider,
            },
          };
        }

        return listing;
      }),

    getBookedDates: publicProcedure
      .input(z.object({ listingId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const res = await db.select({ start: bookings.startDate, end: bookings.endDate }).from(bookings).where(and(eq(bookings.listingId, input.listingId), eq(bookings.status, "Confirmed")));
        const listingRows = await db.select({ availability: listings.availability, icalImportedRanges: listings.icalImportedRanges }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
        const parseRanges = (value: string | null | undefined, source: "manual" | "ical") => {
          if (!value) return [];
          try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((range) => typeof range?.start === "string" && typeof range?.end === "string").map((range) => ({ start: range.start, end: range.end, source })) : []; } catch { return []; }
        };
        return [
          ...res.map(b => ({ start: new Date(b.start).toISOString().split('T')[0], end: new Date(b.end).toISOString().split('T')[0], source: "booking" as const })),
          ...parseRanges(listingRows[0]?.availability, "manual"),
          ...parseRanges(listingRows[0]?.icalImportedRanges, "ical"),
        ];
      }),

    toggleAvailability: ownerProcedure
      .input(z.object({ listingId: z.number().int().positive(), available: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const owned = await db.select({ id: listings.id, status: listings.status }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new TRPCError({ code: "NOT_FOUND", message: "الإعلان غير موجود ضمن ممتلكاتك." });
        const status = input.available ? "Available" : "Rented";
        await db.update(listings).set({ status }).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id)));
        await writeAuditLog({ actorId: ctx.user!.id, action: "listing.availability.updated", entityType: "listing", entityId: input.listingId, beforeData: { status: owned[0].status }, afterData: { status } });
        return { success: true as const, status };
      }),

    setAvailability: ownerProcedure
      .input(z.object({ listingId: z.number().int().positive(), blockedRanges: z.array(z.object({ start: z.string(), end: z.string() })).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const listing = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!listing[0]) throw new Error('لا يمكنك تعديل توفر إعلان لا تملكه');
        const normalized = input.blockedRanges.map(range => {
          const start = new Date(range.start);
          const end = new Date(range.end);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error('فترة التوفر غير صالحة');
          return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
        });
        await db.update(listings).set({ availability: JSON.stringify(normalized) }).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id)));
        return { success: true, blockedRanges: normalized };
      }),

    getIcalSettings: ownerProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const rows = await db.select({ id: listings.id, icalImportUrl: listings.icalImportUrl, icalExportToken: listings.icalExportToken, icalLastSyncedAt: listings.icalLastSyncedAt, icalSyncStatus: listings.icalSyncStatus, icalSyncError: listings.icalSyncError }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!rows[0]) throw new Error("الإعلان غير موجود ضمن ممتلكاتك.");
        return { ...rows[0], exportPath: rows[0].icalExportToken ? `/api/ical/export/${rows[0].icalExportToken}` : null };
      }),

    saveIcalSettings: ownerProcedure
      .input(z.object({ listingId: z.number().int().positive(), importUrl: z.string().trim().url().max(2000).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const owned = await db.select({ id: listings.id, icalExportToken: listings.icalExportToken }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new Error("الإعلان غير موجود ضمن ممتلكاتك.");
        const importUrl = input.importUrl ? validateIcalImportUrl(input.importUrl) : null;
        const token = owned[0].icalExportToken ?? randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
        await db.update(listings).set({ icalImportUrl: importUrl, icalExportToken: token, icalImportedRanges: null, icalLastSyncedAt: null, icalSyncStatus: importUrl ? "never" : "never", icalSyncError: null }).where(eq(listings.id, input.listingId));
        return { success: true, exportPath: `/api/ical/export/${token}`, importConfigured: Boolean(importUrl) };
      }),

    syncIcalNow: ownerProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const owned = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new Error("الإعلان غير موجود ضمن ممتلكاتك.");
        return syncListingIcal(input.listingId);
      }),

    create: ownerProcedure
      .input(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          category: z.string(),
          pricePerDay: z.number(),
          imageUrl: z.string().min(1),
          imageVerificationProof: z.string().min(1),
          city: z.string(),
          officeType: z.string().optional(),
          rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).optional(),
          amenities: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        if (!verifyImageVerificationProof({ proof: input.imageVerificationProof, ownerId: ctx.user!.id, url: input.imageUrl })) {
          const notificationTitle = "تعذر نشر إعلانك / Annonce refusée";
          const notificationMessage = "تعذر نشر الإعلان لأن إثبات فحص الصورة غير صالح. يرجى رفع الصورة من خلال أداة الفحص ثم المحاولة مجدداً.\n\nLa publication a été refusée car la preuve de vérification de l'image est invalide. Veuillez téléverser l'image via l'outil de vérification.";
          await safeNotifyUser({
            userId: ctx.user!.id,
            type: "listing_rejected",
            title: notificationTitle,
            message: notificationMessage,
            href: "/host",
            entityType: "listing_image_verification",
            dedupeKey: `listing-proof-rejected:${ctx.user!.id}:${input.imageUrl}`,
            email: ctx.user!.email ? { to: ctx.user!.email, subject: notificationTitle, ...buildEmailContent(notificationTitle, notificationMessage, "/host") } : undefined,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "يجب رفع الصورة عبر أداة الفحص الآمن قبل نشر الإعلان." });
        }
        const [inserted] = await db.insert(listings).values({
          ownerId: ctx.user!.id,
          title: input.title,
          description: input.description,
          category: input.category,
          pricePerDay: input.pricePerDay,
          imageUrl: input.imageUrl,
          city: input.city,
          officeType: input.officeType,
          rentalPeriod: input.rentalPeriod,
          amenities: input.amenities?.join(',') || null,
          status: "Published",
        });
        const listingId = Number(inserted.insertId);
        const notificationTitle = "تم نشر إعلانك / Annonce publiée";
        const notificationMessage = `تم نشر إعلان «${input.title}» مباشرة بعد اجتياز فحص الصور.\n\nL'annonce «${input.title}» est publiée après validation automatique des images.`;
        await safeNotifyUser({
          userId: ctx.user!.id,
          type: "listing_approved",
          title: notificationTitle,
          message: notificationMessage,
          href: "/host",
          entityType: "listing",
          entityId: listingId,
          dedupeKey: `listing-approved:${ctx.user!.id}:${listingId}`,
          email: ctx.user!.email ? { to: ctx.user!.email, subject: notificationTitle, ...buildEmailContent(notificationTitle, notificationMessage, "/host") } : undefined,
        });
        return { success: true, listingId };
      }),

    update: ownerProcedure
      .input(z.object({
        id: z.number().int().positive(),
        title: z.string().min(2).optional(),
        description: z.string().optional(),
        pricePerDay: z.number().int().nonnegative().optional(),
        city: z.string().min(2).optional(),
        imageUrl: z.string().optional(),
        imageVerificationProof: z.string().optional(),
        officeType: z.string().optional(),
        rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).optional(),
        amenities: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const { id, amenities, imageVerificationProof, ...fields } = input;
        const owned = await db.select({ id: listings.id, imageUrl: listings.imageUrl, status: listings.status }).from(listings)
          .where(and(eq(listings.id, id), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new Error('الإعلان غير موجود ضمن ممتلكاتك.');
        if (fields.imageUrl !== undefined && (!imageVerificationProof || !verifyImageVerificationProof({ proof: imageVerificationProof, ownerId: ctx.user!.id, url: fields.imageUrl }))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يجب إعادة رفع الصورة عبر أداة الفحص الآمن قبل تعديلها." });
        }
        const nextStatus = owned[0].status === "Rejected" ? "Rejected" : "Published";
        await db.update(listings).set({ ...fields, ...(amenities ? { amenities: amenities.join(',') } : {}), status: nextStatus }).where(eq(listings.id, id));
        return { success: true, status: nextStatus };
      }),

    resubmitRejected: ownerProcedure
      .input(z.object({
        id: z.number().int().positive(),
        title: z.string().min(2),
        description: z.string().optional(),
        pricePerDay: z.number().int().nonnegative(),
        city: z.string().min(2),
        imageUrl: z.string().min(1),
        imageVerificationProof: z.string().min(1),
        officeType: z.string().optional(),
        rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).optional(),
        amenities: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const owned = await db.select({ id: listings.id, status: listings.status }).from(listings)
          .where(and(eq(listings.id, input.id), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new TRPCError({ code: "NOT_FOUND", message: "الإعلان غير موجود ضمن ممتلكاتك." });
        if (owned[0].status !== "Rejected") throw new TRPCError({ code: "BAD_REQUEST", message: "يمكن إعادة إرسال الإعلانات المرفوضة فقط." });
        if (!verifyImageVerificationProof({ proof: input.imageVerificationProof, ownerId: ctx.user!.id, url: input.imageUrl })) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يجب رفع صورة أصلية واجتياز الفحص قبل إعادة الإرسال." });
        }
        await db.update(listings).set({ title: input.title, description: input.description, pricePerDay: input.pricePerDay, city: input.city, imageUrl: input.imageUrl, officeType: input.officeType, rentalPeriod: input.rentalPeriod, amenities: input.amenities?.join(',') || null, status: "Pending" }).where(eq(listings.id, input.id));
        await writeAuditLog({ actorId: ctx.user!.id, action: "listing.resubmitted", entityType: "listing", entityId: input.id, afterData: { status: "Pending" } });
        return { success: true as const, status: "Pending" as const };
      }),

    remove: ownerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const owned = await db.select({ id: listings.id }).from(listings)
          .where(and(eq(listings.id, input.id), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new Error('الإعلان غير موجود ضمن ممتلكاتك.');
        await db.delete(listings).where(eq(listings.id, input.id));
        return { success: true };
      }),

    mine: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!['owner', 'admin'].includes(ctx.user!.role)) throw new Error('هذه الصفحة مخصصة للملاك.');
      return db.select().from(listings).where(eq(listings.ownerId, ctx.user!.id)).orderBy(desc(listings.createdAt));
    }),
  }),



  bookings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user!.role === 'admin') {
        return await db.select().from(bookings).orderBy(desc(bookings.createdAt));
      }
      return await db.select().from(bookings).where(eq(bookings.renterId, ctx.user!.id));
    }),

    getById: protectedProcedure
      .input(z.object({ bookingId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const rows = await db.select({
          id: bookings.id,
          renterId: bookings.renterId,
          listingId: bookings.listingId,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
          totalPrice: bookings.totalPrice,
          commissionFee: bookings.commissionFee,
          netProfit: bookings.netProfit,
          status: bookings.status,
          createdAt: bookings.createdAt,
          listingTitle: listings.title,
          listingCity: listings.city,
          listingCategory: listings.category,
          ownerName: users.name,
          ownerWhatsApp: users.whatsappPhone,
        }).from(bookings)
          .innerJoin(listings, eq(bookings.listingId, listings.id))
          .leftJoin(users, eq(listings.ownerId, users.id))
          .where(eq(bookings.id, input.bookingId)).limit(1);
        const booking = rows[0];
        if (!booking || (ctx.user!.role !== "admin" && booking.renterId !== ctx.user!.id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الحجز غير موجود أو لا يخص حسابك." });
        }
        return { ...booking, ownerWhatsApp: booking.status === "Confirmed" ? booking.ownerWhatsApp : null };
      }),

    create: protectedProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        const requestedRange = parseDateRange(input.startDate, input.endDate);
        if (!requestedRange) {
          throw new Error("تواريخ الحجز غير صالحة.");
        }
        const { start, end } = requestedRange;
        const listing = await db.select().from(listings).where(and(eq(listings.id, input.listingId), inArray(listings.status, ["Published", "Available", "Approved"]))).limit(1);
        if (!listing[0]) throw new Error("الإعلان غير موجود.");
        const blockedRanges = [
          ...parseBlockedRanges(listing[0].availability),
          ...parseBlockedRanges(listing[0].icalImportedRanges),
        ];
        const confirmedRanges = await db.select({ start: bookings.startDate, end: bookings.endDate }).from(bookings).where(and(
          eq(bookings.listingId, input.listingId),
          eq(bookings.status, "Confirmed"),
          lt(bookings.startDate, end),
          gt(bookings.endDate, start),
        ));
        if (!isRangeAvailable(requestedRange, blockedRanges) || confirmedRanges.length > 0) {
          throw new Error("الإعلان غير متاح خلال الفترة المحددة.");
        }
        const owner = await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users).where(eq(users.id, listing[0].ownerId)).limit(1);

        const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (!Number.isInteger(durationDays) || durationDays <= 0) throw new Error("مدة الحجز غير صالحة.");
        const subtotal = listing[0].pricePerDay * durationDays;
        // Tier-aware, live commission split: recomputed from the database on
        // every booking so Commission Controller changes apply instantly.
        const commissionPolicy = await resolveEffectiveCommission(db, listing[0].ownerId, subtotal);
        const commissionFee = commissionPolicy.fee;
        const netProfit = subtotal - commissionFee;

        // Pending requests may overlap while awaiting approval. The owner/admin confirmation path below
        // takes the same row lock and performs the authoritative confirmed-overlap check.
        const policyAcceptedAt = new Date();
        const [inserted] = await db.insert(bookings).values({
          renterId: ctx.user!.id,
          listingId: input.listingId,
          startDate: start,
          endDate: end,
          totalPrice: subtotal,
          commissionFee,
          netProfit,
          status: "Pending",
          cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
          cancellationPolicySnapshot: CANCELLATION_POLICY_TEXT,
          cancellationPolicyFingerprint: CANCELLATION_POLICY_FINGERPRINT,
          cancellationPolicyAcceptedAt: policyAcceptedAt,
          cancellationPolicyAcceptedBy: ctx.user!.id,
        });
        const bookingId = Number(inserted.insertId);
        const dateLabel = `${start.toLocaleDateString("fr-MA")} → ${end.toLocaleDateString("fr-MA")}`;
        const ownerTitle = "حجز جديد / Nouvelle réservation";
        const ownerMessage = `توصلت بحجز جديد للإعلان «${listing[0].title}» من ${dateLabel}.\nVous avez reçu une nouvelle réservation pour «${listing[0].title}».`;
        await safeNotifyUser({
          userId: listing[0].ownerId,
          type: "booking_new",
          title: ownerTitle,
          message: ownerMessage,
          href: "/host",
          entityType: "booking",
          entityId: bookingId,
          email: owner[0]?.email ? { to: owner[0].email, subject: ownerTitle, ...buildEmailContent(ownerTitle, ownerMessage, "/host") } : undefined,
        });

        return { success: true, bookingId, subtotal, durationDays, commissionFee, netProfit };
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          bookingId: z.number(),
          status: z.enum(["Pending", "Confirmed", "Cancelled"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        if (!['admin', 'SUPER_ADMIN'].includes(ctx.user!.role)) {
          throw new Error("عذراً، هذه العملية مخصصة لمدير المنصة والمشرفين فقط.");
        }
        await db
          .update(bookings)
          .set({ status: input.status })
          .where(eq(bookings.id, input.bookingId));
        return { success: true };
      }),

    ownerList: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!['owner', 'admin'].includes(ctx.user!.role)) throw new Error('هذه العملية مخصصة للملاك.');
      const rows = await db.select({
        id: bookings.id,
        renterId: bookings.renterId,
        listingId: bookings.listingId,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        totalPrice: bookings.totalPrice,
        commissionFee: bookings.commissionFee,
        netProfit: bookings.netProfit,
        status: bookings.status,
        createdAt: bookings.createdAt,
        listingTitle: listings.title,
        renterName: users.name,
      }).from(bookings)
        .innerJoin(listings, eq(bookings.listingId, listings.id))
        .leftJoin(users, eq(bookings.renterId, users.id))
        .where(eq(listings.ownerId, ctx.user!.id))
        .orderBy(desc(bookings.createdAt));
      return rows;
    }),

    ownerUpdateStatus: ownerProcedure
      .input(z.object({ bookingId: z.number(), status: z.enum(['Confirmed', 'Cancelled']) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        if (!['owner', 'admin'].includes(ctx.user!.role)) throw new Error('هذه العملية مخصصة للملاك.');
        const owned = await db.select({ id: bookings.id }).from(bookings)
          .innerJoin(listings, eq(bookings.listingId, listings.id))
          .where(and(eq(bookings.id, input.bookingId), eq(listings.ownerId, ctx.user!.id)))
          .limit(1);
        if (!owned[0]) throw new Error('الحجز غير موجود ضمن إعلاناتك.');
        const bookingDetails = await db.select({
          bookingId: bookings.id,
          renterId: bookings.renterId,
          listingId: bookings.listingId,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
          status: bookings.status,
          listingTitle: listings.title,
          renterEmail: users.email,
        }).from(bookings)
          .innerJoin(listings, eq(bookings.listingId, listings.id))
          .leftJoin(users, eq(bookings.renterId, users.id))
          .where(eq(bookings.id, input.bookingId)).limit(1);
        const booking = bookingDetails[0];
        if (!booking) throw new Error("الحجز غير موجود.");
        if (booking.status !== "Pending") {
          throw new Error("لا يمكن تغيير حالة هذا الحجز بعد حسمه.");
        }

        const updated = await db.transaction(async (tx) => {
          if (input.status === "Confirmed") {
            const start = new Date(booking.startDate);
            const end = new Date(booking.endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) throw new Error("تواريخ الحجز غير صالحة.");
            // MySQL row lock serializes confirmations for the same listing.
            await tx.execute(sql`SELECT listing_id FROM listings WHERE listing_id = ${booking.listingId} FOR UPDATE`);
            const currentListing = await tx.select({ status: listings.status, availability: listings.availability, icalImportedRanges: listings.icalImportedRanges }).from(listings).where(eq(listings.id, booking.listingId)).limit(1);
            if (!currentListing[0] || !["Published", "Available", "Approved"].includes(currentListing[0].status)) {
              throw new Error("لا يمكن قبول الحجز لأن الإعلان لم يعد متاحاً.");
            }
            const blockedRanges = [...parseBlockedRanges(currentListing[0].availability), ...parseBlockedRanges(currentListing[0].icalImportedRanges)];
            if (!isRangeAvailable({ start, end }, blockedRanges)) throw new Error("لا يمكن قبول الحجز لأن الفترة محجوبة.");
            const overlapping = await tx.select({ id: bookings.id }).from(bookings).where(and(
              eq(bookings.listingId, booking.listingId),
              eq(bookings.status, "Confirmed"),
              ne(bookings.id, booking.bookingId),
              lt(bookings.startDate, end),
              gt(bookings.endDate, start),
            )).limit(1);
            if (overlapping[0]) throw new Error("لا يمكن قبول الحجز لأن الفترة أصبحت محجوزة.");
          }
          return tx.update(bookings).set({ status: input.status }).where(and(eq(bookings.id, input.bookingId), eq(bookings.status, "Pending")));
        });
        if (Number(updated[0]?.affectedRows ?? 0) === 0) throw new Error("تم تحديث الحجز من مستخدم آخر؛ أعد تحميل الصفحة.");

        const accepted = input.status === "Confirmed";
        const title = accepted ? "تم قبول الحجز / Réservation acceptée" : "تم رفض الحجز / Réservation refusée";
        const message = accepted
          ? `تم قبول حجزك لـ «${bookingDetails[0].listingTitle}».\nVotre réservation pour «${bookingDetails[0].listingTitle}» a été acceptée.`
          : `تم رفض حجزك لـ «${bookingDetails[0].listingTitle}».\nVotre réservation pour «${bookingDetails[0].listingTitle}» a été refusée.`;
        await safeNotifyUser({
          userId: bookingDetails[0].renterId,
          type: accepted ? "booking_accepted" : "booking_rejected",
          title,
          message,
          href: "/my-bookings",
          entityType: "booking",
          entityId: bookingDetails[0].bookingId,
          email: bookingDetails[0].renterEmail ? { to: bookingDetails[0].renterEmail, subject: title, ...buildEmailContent(title, message, "/my-bookings") } : undefined,
        });
        return { success: true };
      }),
  }),

  payments: router({
    create: protectedProcedure
      .input(z.object({
        bookingId: z.number().int().positive(),
        method: z.enum(["cmi_card", "bank_transfer"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        const bookingRows = await db.select({
          id: bookings.id,
          renterId: bookings.renterId,
          listingId: bookings.listingId,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
          totalPrice: bookings.totalPrice,
          commissionFee: bookings.commissionFee,
          status: bookings.status,
          cancellationPolicyVersion: bookings.cancellationPolicyVersion,
          cancellationPolicySnapshot: bookings.cancellationPolicySnapshot,
          cancellationPolicyFingerprint: bookings.cancellationPolicyFingerprint,
          cancellationPolicyAcceptedAt: bookings.cancellationPolicyAcceptedAt,
          cancellationPolicyAcceptedBy: bookings.cancellationPolicyAcceptedBy,
        }).from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
        const booking = bookingRows[0];
        if (!booking) throw new Error("الحجز غير موجود.");
        if (ctx.user!.role !== "admin" && booking.renterId !== ctx.user!.id) {
          throw new Error("لا يمكنك الدفع لحجز لا يخص حسابك.");
        }
        if (booking.status === "Cancelled") throw new Error("لا يمكن دفع حجز ملغى.");

        const existingPaymentRows = await db.select().from(payments)
          .where(and(eq(payments.bookingId, input.bookingId), eq(payments.payerId, booking.renterId)))
          .orderBy(desc(payments.createdAt)).limit(1);
        const existingPayment = existingPaymentRows[0];
        if (existingPayment) {
          if (existingPayment.method !== input.method) {
            throw new Error("يوجد دفع سابق لهذا الحجز بطريقة مختلفة.");
          }
          const existingInvoice = await db.select().from(invoices)
            .where(eq(invoices.paymentId, existingPayment.id)).limit(1);
          if (existingInvoice[0]) {
            return { payment: existingPayment, invoice: existingInvoice[0] };
          }
        }

        const settings = await db.select({
          vatRateBasisPoints: platformSettings.vatRateBasisPoints,
        }).from(platformSettings).limit(1);
        const vatRateBasisPoints = settings[0]?.vatRateBasisPoints ?? 2_000;
        const totals = calculateInvoiceTotals(booking.totalPrice, booking.commissionFee, vatRateBasisPoints);
        const paymentStatus = getSimulatedPaymentStatus(input.method);
        const providerPrefix = input.method === "cmi_card" ? "CMI-SIM" : "BANK-SIM";
        const providerReference = `${providerPrefix}-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;

        const [paymentInsert] = await db.insert(payments).values({
          bookingId: booking.id,
          payerId: booking.renterId,
          method: input.method,
          status: paymentStatus,
          amount: totals.total,
          currency: totals.currency,
          providerReference,
          simulated: true,
        });
        const paymentId = Number(paymentInsert.insertId);
        const [invoiceInsert] = await db.insert(invoices).values({
          invoiceNumber: createInvoiceNumber(booking.id),
          bookingId: booking.id,
          paymentId,
          payerId: booking.renterId,
          subtotal: totals.subtotal,
          commissionFee: totals.commissionFee,
          vatRateBasisPoints: totals.vatRateBasisPoints,
          vatAmount: totals.vatAmount,
          total: totals.total,
          currency: totals.currency,
          status: paymentStatus === "Succeeded" ? "Issued" : "Pending",
          cancellationPolicyVersion: booking.cancellationPolicyVersion ?? CANCELLATION_POLICY_VERSION,
          cancellationPolicySnapshot: booking.cancellationPolicySnapshot ?? CANCELLATION_POLICY_TEXT,
          cancellationPolicyFingerprint: booking.cancellationPolicyFingerprint ?? CANCELLATION_POLICY_FINGERPRINT,
          cancellationPolicyAcceptedAt: booking.cancellationPolicyAcceptedAt ?? new Date(),
          cancellationPolicyAcceptedBy: booking.cancellationPolicyAcceptedBy ?? booking.renterId,
        });
        const invoiceId = Number(invoiceInsert.insertId);
        const createdInvoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
        const createdPayment = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
        // Multi-vendor escrow: once a confirmed booking is paid, hold the split
        // in the escrow ledger until the release date (booking end date).
        if (paymentStatus === "Succeeded" && booking.status === "Confirmed") {
          const escrowListing = await db.select({ ownerId: listings.ownerId, category: listings.category }).from(listings).where(eq(listings.id, booking.listingId)).limit(1);
          if (escrowListing[0]) {
            await createEscrowEntry(db, {
              bookingId: booking.id,
              paymentId,
              guestId: booking.renterId,
              vendorId: escrowListing[0].ownerId,
              listingCategory: escrowListing[0].category ?? "real_estate",
              totalPaid: totals.total,
              releaseDate: new Date(booking.endDate),
            });
          }
        }
        if (!createdInvoice[0] || !createdPayment[0]) throw new Error("تعذر حفظ تفاصيل الفاتورة.");

        let voucher: typeof bookingVouchers.$inferSelect | null = null;
        const requestOrigin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
        if (paymentStatus === "Succeeded" && booking.status === "Confirmed") {
          const existingVoucher = await db.select().from(bookingVouchers)
            .where(eq(bookingVouchers.bookingId, booking.id)).limit(1);
          if (existingVoucher[0]) {
            voucher = existingVoucher[0];
          } else {
            const code = createVoucherCode(booking.id);
            const voucherUrl = `${requestOrigin}/voucher/${code}`;
            const [voucherInsert] = await db.insert(bookingVouchers).values({
              bookingId: booking.id,
              renterId: booking.renterId,
              code,
              qrPayload: voucherUrl,
              status: "Issued",
            });
            const voucherRows = await db.select().from(bookingVouchers)
              .where(eq(bookingVouchers.id, Number(voucherInsert.insertId))).limit(1);
            voucher = voucherRows[0] ?? null;
          }

          const details = await db.select({
            listingTitle: listings.title,
            listingCity: listings.city,
            ownerId: listings.ownerId,
            ownerName: users.name,
            ownerEmail: users.email,
            ownerWhatsApp: users.whatsappPhone,
            renterName: users.name,
          }).from(listings)
            .leftJoin(users, eq(listings.ownerId, users.id))
            .where(eq(listings.id, booking.listingId)).limit(1);
          const detail = details[0];
          if (voucher && detail) {
            const voucherUrl = voucher.qrPayload;
            const renterMessage = buildVoucherRenterMessage(booking.id, detail.listingTitle, voucher.code, voucherUrl);
            const ownerMessage = buildVoucherOwnerMessage(booking.id, detail.listingTitle, booking.startDate, booking.endDate);
            await safeNotifyUser({
              userId: booking.renterId,
              type: "voucher_issued",
              title: "تذكرة الوصول الذكي جاهزة / Voucher prêt",
              message: renterMessage,
              href: `/voucher/${voucher.code}`,
              entityType: "voucher",
              entityId: voucher.id,
              email: ctx.user!.email ? { to: ctx.user!.email, subject: "ALTUSplace — تذكرة الوصول الذكي", ...buildEmailContent("تذكرة الوصول الذكي جاهزة / Voucher prêt", renterMessage, voucherUrl) } : undefined,
            });
            if (detail.ownerId !== booking.renterId) {
              await safeNotifyUser({
                userId: detail.ownerId,
                type: "voucher_issued",
                title: "دفع جديد وتجهيز الخدمة / Paiement reçu",
                message: ownerMessage,
                href: "/host",
                entityType: "booking",
                entityId: booking.id,
                email: detail.ownerEmail ? { to: detail.ownerEmail, subject: "ALTUSplace — دفع حجز جديد", ...buildEmailContent("دفع جديد وتجهيز الخدمة / Paiement reçu", ownerMessage, `${requestOrigin}/host`) } : undefined,
              });
            }
          }
        }
        return { payment: createdPayment[0], invoice: createdInvoice[0], voucher };
      }),
  }),

  vouchers: router({
    getByCode: protectedProcedure
      .input(z.object({ code: z.string().min(8).max(80) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const rows = await db.select({
          voucher: bookingVouchers,
          bookingId: bookings.id,
          renterId: bookings.renterId,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
          totalPrice: bookings.totalPrice,
          bookingStatus: bookings.status,
          listingId: listings.id,
          listingTitle: listings.title,
          listingCategory: listings.category,
          listingCity: listings.city,
          listingImageUrl: listings.imageUrl,
          ownerId: listings.ownerId,
          ownerName: users.name,
          ownerEmail: users.email,
          ownerWhatsApp: users.whatsappPhone,
        }).from(bookingVouchers)
          .innerJoin(bookings, eq(bookingVouchers.bookingId, bookings.id))
          .innerJoin(listings, eq(bookings.listingId, listings.id))
          .leftJoin(users, eq(listings.ownerId, users.id))
          .where(eq(bookingVouchers.code, input.code)).limit(1);
        const result = rows[0];
        if (!result || result.voucher.status !== "Issued" || result.bookingStatus !== "Confirmed" || (ctx.user!.role !== "admin" && result.renterId !== ctx.user!.id && result.ownerId !== ctx.user!.id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "تذكرة الوصول غير موجودة أو لا تخص حسابك." });
        }
        const qrCodeDataUrl = await QRCode.toDataURL(result.voucher.qrPayload, { width: 320, margin: 2 });
        const mapsUrl = createMapsSearchUrl(result.listingTitle, result.listingCity);
        return { ...result, ownerWhatsApp: result.bookingStatus === "Confirmed" ? result.ownerWhatsApp : null, qrCodeDataUrl, mapsUrl };
      }),
  }),

  invoices: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const query = db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        bookingId: invoices.bookingId,
        payerId: invoices.payerId,
        subtotal: invoices.subtotal,
        commissionFee: invoices.commissionFee,
        vatRateBasisPoints: invoices.vatRateBasisPoints,
        vatAmount: invoices.vatAmount,
        total: invoices.total,
        currency: invoices.currency,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
        cancellationPolicyVersion: invoices.cancellationPolicyVersion,
        cancellationPolicySnapshot: invoices.cancellationPolicySnapshot,
        cancellationPolicyFingerprint: invoices.cancellationPolicyFingerprint,
        cancellationPolicyAcceptedAt: invoices.cancellationPolicyAcceptedAt,
        cancellationPolicyAcceptedBy: invoices.cancellationPolicyAcceptedBy,
        paymentId: invoices.paymentId,
        paymentMethod: payments.method,
        paymentStatus: payments.status,
        bookingStatus: bookings.status,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        listingTitle: listings.title,
      }).from(invoices)
        .innerJoin(bookings, eq(invoices.bookingId, bookings.id))
        .innerJoin(payments, eq(invoices.paymentId, payments.id))
        .leftJoin(listings, eq(bookings.listingId, listings.id));
      if (ctx.user!.role === "admin") return query.orderBy(desc(invoices.issuedAt));
      return query.where(eq(invoices.payerId, ctx.user!.id)).orderBy(desc(invoices.issuedAt));
    }),

    getByBooking: protectedProcedure
      .input(z.object({ bookingId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const rows = await db.select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          bookingId: invoices.bookingId,
          payerId: invoices.payerId,
          subtotal: invoices.subtotal,
          commissionFee: invoices.commissionFee,
          vatRateBasisPoints: invoices.vatRateBasisPoints,
          vatAmount: invoices.vatAmount,
          total: invoices.total,
          currency: invoices.currency,
          status: invoices.status,
          issuedAt: invoices.issuedAt,
          cancellationPolicyVersion: invoices.cancellationPolicyVersion,
          cancellationPolicySnapshot: invoices.cancellationPolicySnapshot,
          cancellationPolicyFingerprint: invoices.cancellationPolicyFingerprint,
          cancellationPolicyAcceptedAt: invoices.cancellationPolicyAcceptedAt,
          cancellationPolicyAcceptedBy: invoices.cancellationPolicyAcceptedBy,
          paymentId: invoices.paymentId,
          paymentMethod: payments.method,
          paymentStatus: payments.status,
          bookingStatus: bookings.status,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
          listingTitle: listings.title,
          city: listings.city,
        }).from(invoices)
          .innerJoin(bookings, eq(invoices.bookingId, bookings.id))
          .innerJoin(payments, eq(invoices.paymentId, payments.id))
          .leftJoin(listings, eq(bookings.listingId, listings.id))
          .where(eq(invoices.bookingId, input.bookingId)).limit(1);
        const invoice = rows[0];
        if (!invoice || (ctx.user!.role !== "admin" && invoice.payerId !== ctx.user!.id)) {
          throw new Error("الفاتورة غير موجودة أو لا تخص حسابك.");
        }
        return invoice;
      }),
  }),

  commercialLeaseContracts: router({
    create: protectedProcedure
      .input(z.object({
        bookingId: z.number(),
        leaseType: z.enum(["commercial", "professional"]),
        language: z.enum(["ar", "fr"]).default("fr"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const booking = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
        if (!booking[0] || booking[0].renterId !== ctx.user!.id) {
          throw new Error("لا يمكن إنشاء عقد لهذا الحجز.");
        }
        if (booking[0].status !== "Confirmed") {
          throw new Error("لا يمكن إنشاء عقد الكراء قبل اعتماد الحجز من المالك.");
        }
        const existing = await db.select().from(commercialLeaseContracts).where(eq(commercialLeaseContracts.bookingId, input.bookingId)).limit(1);
        if (existing[0]) {
          const stored = existing[0].pdfKey ? await storageGet(existing[0].pdfKey) : null;
          return { success: true, contractId: existing[0].id, reference: existing[0].reference, pdfUrl: stored?.url || null };
        }
        const listing = await db.select().from(listings).where(eq(listings.id, booking[0].listingId)).limit(1);
        if (!listing[0]) throw new Error("الإعلان المرتبط بالحجز غير موجود.");
        const landlord = await db.select({ name: users.name, commercialRegister: users.commercialRegister }).from(users).where(eq(users.id, listing[0].ownerId)).limit(1);
        const canonicalLandlordName = landlord[0]?.name || "المالك / الشركة المؤجرة";
        const canonicalLandlordRc = landlord[0]?.commercialRegister || null;
        const canonicalTenantName = ctx.user!.name || "المستأجر";
        const canonicalStartDate = new Date(booking[0].startDate);
        const canonicalEndDate = new Date(booking[0].endDate);
        const canonicalMonthlyRent = booking[0].totalPrice;
        const reference = `ALT-LEASE-${input.bookingId}-${Date.now().toString(36).toUpperCase()}`;
        const legalNotice = input.language === "ar"
          ? "تنبيه قانوني: هذا نموذج تقني عام، ويجب مراجعته واعتماده من طرف محامٍ أو موثق مغربي قبل التوقيع أو الاستعمال الفعلي."
          : "Avertissement légal : ce modèle technique doit être validé par un avocat ou un notaire au Maroc avant toute signature ou utilisation réelle.";
        const pdfBuffer = generateServerCommercialLeasePdf({
          reference,
          landlordName: canonicalLandlordName,
          landlordRc: canonicalLandlordRc,
          tenantName: canonicalTenantName,
          premises: listing[0].title,
          city: listing[0].city,
          startDate: canonicalStartDate.toISOString(),
          endDate: canonicalEndDate.toISOString(),
          monthlyRent: canonicalMonthlyRent,
          deposit: 0,
          purpose: input.leaseType,
          language: input.language,
        });
        const storedPdf = await storagePut(`contracts/${reference}.pdf`, pdfBuffer, "application/pdf");
        const [inserted] = await db.insert(commercialLeaseContracts).values({
          bookingId: input.bookingId,
          landlordId: listing[0].ownerId,
          tenantId: ctx.user!.id,
          reference,
          leaseType: input.leaseType,
          landlordName: canonicalLandlordName,
          landlordRc: canonicalLandlordRc,
          tenantName: canonicalTenantName,
          premises: listing[0].title,
          city: listing[0].city,
          startDate: canonicalStartDate,
          endDate: canonicalEndDate,
          monthlyRent: canonicalMonthlyRent,
          deposit: 0,
          legalNotice,
          pdfKey: storedPdf.key,
          status: "Generated",
        });
        const contractId = Number(inserted.insertId);
        let reminderTaskUid: string | null = null;
        try {
          const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
          const job = await createHeartbeatJob({
            name: `lease-end-reminder-${contractId}`,
            cron: "0 0 8 * * *",
            path: "/api/scheduled/lease-end-reminder",
            description: `تذكير انتهاء عقد الكراء ${reference} قبل 48 ساعة`,
          }, sessionToken);
          reminderTaskUid = job.taskUid;
          await db.update(commercialLeaseContracts)
            .set({ leaseEndReminderTaskUid: job.taskUid })
            .where(eq(commercialLeaseContracts.id, contractId));
        } catch (error) {
          console.warn("[LeaseReminder] Could not schedule contract reminder:", error instanceof Error ? error.message : String(error));
        }
        return { success: true, contractId, reference, pdfUrl: storedPdf.url, reminderTaskUid };
      }),

    getByBooking: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const result = await db.select().from(commercialLeaseContracts)
          .where(and(eq(commercialLeaseContracts.bookingId, input.bookingId), eq(commercialLeaseContracts.tenantId, ctx.user!.id)))
          .limit(1);
        if (!result[0]) return null;
        const stored = result[0].pdfKey ? await storageGet(result[0].pdfKey) : null;
        return { ...result[0], pdfUrl: stored?.url || null };
      }),
  }),

  reviews: router({
    listByListing: publicProcedure
      .input(z.object({ listingId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const result = await db
          .select({
            id: reviews.id,
            rating: reviews.rating,
            comment: reviews.comment,
            createdAt: reviews.createdAt,
            userName: users.name,
          })
          .from(reviews)
          .innerJoin(users, eq(reviews.userId, users.id))
          .where(eq(reviews.listingId, input.listingId))
          .orderBy(desc(reviews.createdAt));
        return result;
      }),

    create: protectedProcedure
      .input(
        z.object({
          listingId: z.number(),
          bookingId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().min(3).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const booking = await db
          .select({
            id: bookings.id,
            renterId: bookings.renterId,
            listingId: bookings.listingId,
            status: bookings.status,
            endDate: bookings.endDate,
          })
          .from(bookings)
          .where(eq(bookings.id, input.bookingId))
          .limit(1);
        const ownedCompletedBooking = booking[0]
          && booking[0].renterId === ctx.user!.id
          && booking[0].listingId === input.listingId
          && booking[0].status === "Confirmed"
          && booking[0].endDate.getTime() <= Date.now();
        if (!ownedCompletedBooking) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا يمكن إضافة تقييم إلا بعد انتهاء حجز مؤكد تملكه.",
          });
        }
        const existing = await db
          .select({ id: reviews.id })
          .from(reviews)
          .where(and(eq(reviews.bookingId, input.bookingId), eq(reviews.userId, ctx.user!.id)))
          .limit(1);
        if (existing[0]) {
          throw new TRPCError({ code: "CONFLICT", message: "تم تقييم هذا الحجز مسبقاً." });
        }
        await db.insert(reviews).values({
          userId: ctx.user!.id,
          listingId: input.listingId,
          bookingId: input.bookingId,
          rating: input.rating,
          comment: input.comment,
        });
        return { success: true };
      }),
  }),

  comments: router({
    listByListing: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.number().int().positive().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { items: [], nextCursor: null as number | null };
        const viewerId = ctx.user?.id ?? null;
        const filters = [eq(listingComments.listingId, input.listingId), eq(listingComments.status, "visible")];
        if (input.cursor) filters.push(lt(listingComments.id, input.cursor));
        const result = await db
          .select({
            id: listingComments.id,
            parentId: listingComments.parentId,
            body: listingComments.body,
            authorName: users.name,
            authorId: listingComments.authorId,
            createdAt: listingComments.createdAt,
          })
          .from(listingComments)
          .innerJoin(users, eq(listingComments.authorId, users.id))
          .where(and(...filters))
          .orderBy(desc(listingComments.id))
          .limit(input.limit + 1);
        const rows = result.slice(0, input.limit);
        const nextCursor = result.length > input.limit ? rows[rows.length - 1].id : null;
        const topLevel = rows.filter((row) => row.parentId === null);
        const items = topLevel.map((comment) => ({
          id: comment.id,
          body: comment.body,
          authorName: comment.authorName ?? "guest",
          createdAt: comment.createdAt,
          isMine: comment.authorId === viewerId,
          replies: rows
            .filter((row) => row.parentId === comment.id)
            .map((reply) => ({
              id: reply.id,
              parentId: reply.parentId!,
              body: reply.body,
              authorName: reply.authorName ?? "guest",
              createdAt: reply.createdAt,
              isMine: reply.authorId === viewerId,
            })),
        }));
        return { items, nextCursor };
      }),

    create: protectedProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        body: z.string().trim().min(1).max(2000),
        parentId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        if (input.parentId) {
          const [parentRow] = await db
            .select({ id: listingComments.id })
            .from(listingComments)
            .where(and(eq(listingComments.id, input.parentId), eq(listingComments.listingId, input.listingId)))
            .limit(1);
          if (!parentRow) throw new TRPCError({ code: "BAD_REQUEST", message: "التعليق الأصلي غير موجود." });
        }
        await db.insert(listingComments).values({
          listingId: input.listingId,
          authorId: ctx.user!.id,
          parentId: input.parentId ?? null,
          body: input.body,
          status: "visible",
        });
        return { success: true as const };
      }),

    remove: protectedProcedure
      .input(z.object({ commentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [row] = await db
          .select({ authorId: listingComments.authorId })
          .from(listingComments)
          .where(eq(listingComments.id, input.commentId))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "التعليق غير موجود." });
        if (row.authorId !== ctx.user!.id && ctx.user!.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك حذف هذا التعليق." });
        }
        await db.delete(listingComments).where(eq(listingComments.id, input.commentId));
        return { success: true as const };
      }),
  }),

  translation: router({
    translateText: protectedProcedure
      .input(z.object({
        text: z.string().trim().min(1).max(2000),
        targetLanguage: z.enum(["ar", "fr", "en"]),
        sourceLanguage: z.enum(["ar", "fr", "en"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await translateWithAws(input.text, input.sourceLanguage ?? "ar", input.targetLanguage);
        return { translatedText: result.translatedText ?? input.text, fromCache: result.fromCache, provider: result.provider };
      }),
    clearCache: protectedProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .mutation(async ({ input }) => ({ cleared: await invalidateTranslationCache(input.listingId) })),
    stats: protectedProcedure.query(async () => getTranslationStats()),
    health: publicProcedure.query(() => ({
      enabled: ENV.translationEnabled,
      provider: ENV.translationProvider,
      available: isTranslationAvailable(),
      supportedLanguages: SUPPORTED_LANGUAGES,
      awsConfigured: Boolean(ENV.awsTranslateAccessKeyId && ENV.awsTranslateSecretAccessKey),
      googleConfigured: Boolean(ENV.googleTranslateApiKey),
      deeplConfigured: Boolean(ENV.deeplApiKey),
    })),
  }),
});

export type AppRouter = typeof appRouter;
