import { COOKIE_NAME } from "@shared/const";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, ownerProcedure, publicProcedure, protectedProcedure, router, superAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { listings, listingAnalyticsEvents, listingComments, bookings, reviews, users, commercialLeaseContracts, notifications, platformSettings, commissionTiers, escrowEntries, payoutRequests, disputes, disputeAttachments, supportTickets, payments, invoices, kycSubmissions, bookingVouchers, bookingMessages, auditLogs, refundRequests, transactions } from "../drizzle/schema";
import { eq, and, lte, gte, lt, gt, asc, desc, count, isNull, inArray, ne, or, not, ilike, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { safeNotifyUser, buildEmailContent, sendWhatsAppText, normalizeWhatsAppNumber } from "./notificationService";
import { generateCarRentalContractPdf } from "./carRentalPdf";
import { z } from "zod";
import { storageGet, storagePut } from "./storage";
import { generateServerCommercialLeasePdf } from "./commercialLeasePdf";
import { createHeartbeatJob } from "./_core/heartbeat";
import { calculateInvoiceTotals, createInvoiceNumber } from "./billing";
import { buildVoucherOwnerMessage, buildVoucherRenterMessage, createMapsSearchUrl, createVoucherCode } from "../shared/voucher";
import { escapeIcal, parseIcalEvents, validateIcalImportUrl } from "../shared/ical";
import { syncListingIcal } from "./ical";
import { CANCELLATION_POLICY_VERSION, CANCELLATION_POLICY_TEXT, CANCELLATION_POLICY_FINGERPRINT } from "../shared/cancellationPolicySnapshot";
import { createImageVerificationProof, ORIGINAL_IMAGE_REJECTION_MESSAGE, verifyImageVerificationProof, verifyOriginalListingImage } from "./imageVerification";
import { isRangeAvailable, overlaps, parseBlockedRanges, parseDateRange } from "./availability";
import { getTranslatedListing, getTranslationStats, invalidateTranslationCache, isTranslationAvailable, SUPPORTED_LANGUAGES, translateWithAws } from "./_core/translation";
import { ENV } from "./_core/env";
import { getKycStatusPayload } from "./verification/eligibility";
import { assertKycEligibleToBook } from "./verification/eligibility";
import { maskDocumentNumber, normalizeBookingCategory } from "./verification/requirements";
import { ADDONS_CATALOG, calculateAddOnsTotal, isAddOnId } from "./addons";
import { createEscrowEntry, freezeEscrowEntry, getGlobalCommission, getTierCommission, mediateEscrowEntry, releaseEscrowEntry, resolveEffectiveCommission, upsertGlobalCommission, upsertTierCommission, VENDOR_TIERS } from "./escrow";
import { createProviderCharge, gatewaySupportsCurrency, type GatewayCode } from "./payments/providers";
import { convertFromMAD, resolveExchangeRates } from "./payments/exchangeRates";
import { isPayzoneConfigured, buildPayzoneRedirect, createPayzoneOrderRef } from "./payments/payzone";
import { isPaytabsConfigured, createPaytabsTransaction, createPaytabsOrderId } from "./payments/paytabs";
import { cashVoucherExpiry } from "./payments/cashVoucher";
import { insertGatewayTransaction, reserveCashVoucherReference } from "./payments/transactionLedger";
import type { GatewayRedirect } from "./payments/types";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Strips private calendar fields (icalImportUrl / icalExportToken) from listing
 * rows before they are exposed through public procedures. The owner-only
 * listing queries keep the full row.
 */
function toPublicListing<T extends object>(row: T): T {
  if (!row) return row;
  const safe = { ...row } as Record<string, unknown>;
  delete safe.icalImportUrl;
  delete safe.icalExportToken;
  return safe as T;
}

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
        whatsappPhone: z.string().trim().max(32).refine((value) => !value || normalizeWhatsAppNumber(value) !== null, "رقم واتساب غير صالح - أدخل الرقم بالصيغة الدولية.").optional().nullable(),
        commercialRegister: z.string().trim().max(120).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const normalize = (value?: string | null) => value?.trim() || null;
        await db.update(users).set({
          whatsappPhone: normalizeWhatsAppNumber(input.whatsappPhone ?? "") ?? null,
          commercialRegister: normalize(input.commercialRegister),
        }).where(eq(users.id, ctx.user!.id));
        return { success: true as const };
      }),
    becomeAgency: protectedProcedure
      .input(z.object({
        agencyName: z.string().trim().min(2).max(80),
        commercialRegister: z.string().trim().max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        if (['owner', 'admin', 'partner', 'SUPER_ADMIN'].includes(ctx.user!.role)) {
          throw new TRPCError({ code: "CONFLICT", message: "أنت مسجل بالفعل كوكالة تأجير أو مشرف." });
        }
        const beforeRole = ctx.user!.role;
        try {
          await db.update(users).set({
            role: 'owner',
            agencyName: input.agencyName,
            commercialRegister: input.commercialRegister?.trim() || null,
          }).where(eq(users.id, ctx.user!.id));
        } catch (error) {
          console.error("[becomeAgency] Failed to promote user", { userId: ctx.user!.id, error });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إتمام التسجيل. حاول مرة أخرى أو تواصل مع الدعم." });
        }
        try {
          await writeAuditLog({
            actorId: ctx.user!.id,
            action: "auth.become_agency",
            entityType: "user",
            entityId: ctx.user!.id,
            beforeData: { role: beforeRole },
            afterData: { role: 'owner', agencyName: input.agencyName },
          });
        } catch (error) {
          // Audit logging must never roll back a successful registration.
          console.warn("[becomeAgency] Audit log failed", { userId: ctx.user!.id, error });
        }
        return { success: true as const, role: 'owner' as const };
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
        whatsappPhone: z.string().trim().max(32).refine((value) => !value || normalizeWhatsAppNumber(value) !== null, "رقم واتساب غير صالح - أدخل الرقم بالصيغة الدولية.").optional().nullable(),
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
          whatsappPhone: normalizeWhatsAppNumber(input.whatsappPhone ?? "") ?? null,
        }).where(eq(users.id, ctx.user!.id));
        await writeAuditLog({ actorId: ctx.user!.id, action: "agency.settings.updated", entityType: "user", entityId: ctx.user!.id, afterData: { agencyName: normalize(input.agencyName), agencyPhone: normalize(input.agencyPhone), agencyEmail: normalize(input.agencyEmail), whatsappPhone: normalizeWhatsAppNumber(input.whatsappPhone ?? "") ?? null } });
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
    recentActivity: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const listingIds = (await db.select({ id: listings.id }).from(listings).where(eq(listings.ownerId, ctx.user!.id))).map((row) => row.id);
      if (listingIds.length === 0) return [];
      const bookingRows = await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.listingId, listingIds));
      const bookingIds = bookingRows.map((row) => row.id).filter((id) => id !== null) as number[];
      const conds: SQL[] = [eq(auditLogs.actorId, ctx.user!.id)];
      if (listingIds.length > 0) {
        conds.push(and(inArray(auditLogs.entityType, ["listing", "user"]), inArray(auditLogs.entityId, [...listingIds, ctx.user!.id]))!);
      }
      if (bookingIds.length > 0) {
        conds.push(and(eq(auditLogs.entityType, "booking"), inArray(auditLogs.entityId, bookingIds))!);
      }
      return db.select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorName: users.name,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
        createdAt: auditLogs.createdAt,
      }).from(auditLogs).leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(or(...conds))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);
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
        const [inserted] = await db.insert(bookingMessages).values({ bookingId: input.bookingId, senderId: ctx.user!.id, recipientId, body: input.body }).returning({ insertId: bookingMessages.id });
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
        const [inserted] = await db.insert(refundRequests).values({ bookingId: input.bookingId, requestedBy: ctx.user!.id, amount: input.amount, reason: input.reason }).returning({ insertId: refundRequests.id });
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
        }).returning({ id: kycSubmissions.id });
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
        db.select({ gross: bookings.totalPrice, fees: bookings.commissionFee, createdAt: bookings.createdAt }).from(bookings).where(eq(bookings.status, 'Confirmed')),
        db.select({ createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100),
      ]);
      const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const now = new Date();
      const months: Array<{ key: string; label: string; revenue: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: monthKey(d), label: d.toLocaleDateString('fr-MA', { month: 'short' }), revenue: 0 });
      }
      for (const row of revenueRows) {
        if (!row.createdAt) continue;
        const bucket = months.find((month) => month.key === monthKey(new Date(row.createdAt)));
        if (bucket) bucket.revenue += row.gross;
      }
      return {
        users: Number(userRows[0]?.value ?? 0), owners: Number(ownerRows[0]?.value ?? 0), renters: Number(renterRows[0]?.value ?? 0), activeAgencies: Number(activeAgencyRows[0]?.value ?? 0),
        listings: Number(listingRows[0]?.value ?? 0), pendingListings: Number(pendingRows[0]?.value ?? 0), bookings: Number(bookingRows[0]?.value ?? 0),
        grossRevenue: revenueRows.reduce((sum, row) => sum + row.gross, 0), platformFees: revenueRows.reduce((sum, row) => sum + row.fees, 0),
        userGrowth: recentUsers.filter(user => user.createdAt && user.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
        monthlyRevenue: months,
      };
    }),
    cleanupDemoData: adminProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      const demoOwnerRows = await db.select({ id: users.id }).from(users).where(eq(users.openId, 'demo-owner-altusplace')).limit(50);
      const ownerIds = demoOwnerRows.map((row) => row.id);
      const demoListingRows = await db.select({ id: listings.id }).from(listings)
        .where(or(inArray(listings.ownerId, ownerIds.length ? ownerIds : [-1]), ilike(listings.title, '%رينو كليو%')));
      const listingIds = demoListingRows.map((row) => row.id);
      if (listingIds.length === 0) {
        const ownerRemoved = ownerIds.length ? (await db.delete(users).where(inArray(users.id, ownerIds)).returning({ id: users.id })).length : 0;
        await writeAuditLog({ actorId: ctx.user.id, action: 'dev.cleanup_demo_data', entityType: 'listing', entityId: 0, beforeData: { listingIds: [] }, afterData: { ownerRemoved } });
        return { listingsRemoved: 0, bookingsRemoved: 0, paymentsRemoved: 0, invoicesRemoved: 0, ownerRemoved, message: 'No demo listings found' };
      }
      const demoBookingRows = await db.select({ id: bookings.id }).from(bookings)
        .where(or(inArray(bookings.listingId, listingIds), inArray(bookings.secondaryListingId, listingIds)));
      const bookingIds = demoBookingRows.map((row) => row.id);

      const paymentRows = bookingIds.length
        ? await db.delete(payments).where(inArray(payments.bookingId, bookingIds)).returning({ id: payments.id })
        : [];
      // Child-first deletion so no orphaned rows survive cleanup.
      if (bookingIds.length) {
        await db.delete(bookingMessages).where(inArray(bookingMessages.bookingId, bookingIds));
        await db.delete(bookingVouchers).where(inArray(bookingVouchers.bookingId, bookingIds));
        await db.delete(escrowEntries).where(inArray(escrowEntries.bookingId, bookingIds));
        await db.delete(refundRequests).where(inArray(refundRequests.bookingId, bookingIds));
        await db.delete(commercialLeaseContracts).where(inArray(commercialLeaseContracts.bookingId, bookingIds));
        await db.delete(reviews).where(or(inArray(reviews.bookingId, bookingIds), inArray(reviews.listingId, listingIds)));
      }
      const invoiceRows = bookingIds.length
        ? await db.delete(invoices).where(inArray(invoices.bookingId, bookingIds)).returning({ id: invoices.id })
        : [];
      await db.delete(listingComments).where(inArray(listingComments.listingId, listingIds));
      await db.delete(listingAnalyticsEvents).where(inArray(listingAnalyticsEvents.listingId, listingIds));
      const bookingRows = await db.delete(bookings)
        .where(or(inArray(bookings.listingId, listingIds), inArray(bookings.secondaryListingId, listingIds)))
        .returning({ id: bookings.id });
      const listingRows = await db.delete(listings).where(inArray(listings.id, listingIds)).returning({ id: listings.id });
      const ownerRemoved = ownerIds.length ? (await db.delete(users).where(inArray(users.id, ownerIds)).returning({ id: users.id })).length : 0;

      await writeAuditLog({
        actorId: ctx.user.id,
        action: 'dev.cleanup_demo_data',
        entityType: 'listing',
        entityId: listingIds[0],
        beforeData: { listingIds, bookingIds },
        afterData: { listingsRemoved: listingRows.length, bookingsRemoved: bookingRows.length, paymentsRemoved: paymentRows.length, invoicesRemoved: invoiceRows.length, ownerRemoved },
      });
      return {
        listingsRemoved: listingRows.length,
        bookingsRemoved: bookingRows.length,
        paymentsRemoved: paymentRows.length,
        invoicesRemoved: invoiceRows.length,
        ownerRemoved,
        message: 'Demo data cleaned',
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
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(['renter', 'owner', 'admin', 'partner', 'user', 'SUPER_ADMIN']) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        if (input.userId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تغيير دور حسابك الإداري بنفسك.' });
        const [before] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود.' });
        if (before.role === 'SUPER_ADMIN' && ctx.user.role !== 'SUPER_ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'حسابات الإدارة العليا محمية ولا يمكن تعديل دورها إلا من إدارة عليا.' });
        if (input.role === 'SUPER_ADMIN' && ctx.user.role !== 'SUPER_ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'ترقية حساب إلى إدارة عليا متاحة فقط لحسابات الإدارة العليا.' });
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        await writeAuditLog({ actorId: ctx.user.id, action: 'user.role_updated', entityType: 'user', entityId: input.userId, beforeData: before, afterData: { role: input.role } });
        return { success: true as const };
      }),
    bookings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: bookings.id, listingId: bookings.listingId, status: bookings.status, totalPrice: bookings.totalPrice, commissionFee: bookings.commissionFee, startDate: bookings.startDate, endDate: bookings.endDate, createdAt: bookings.createdAt, listingTitle: listings.title, renterName: users.name, renterEmail: users.email })
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
      return db.select({ id: listings.id, title: listings.title, description: listings.description, category: listings.category, status: listings.status, isFeatured: listings.isFeatured, pricePerDay: listings.pricePerDay, city: listings.city, imageUrl: listings.imageUrl, lat: listings.lat, lng: listings.lng, fuelType: listings.fuelType, transmission: listings.transmission, rooms: listings.rooms, officeType: listings.officeType, rentalPeriod: listings.rentalPeriod, amenities: listings.amenities, propertyType: listings.propertyType, pricePerMonth: listings.pricePerMonth, ownerId: listings.ownerId, ownerName: users.name, createdAt: listings.createdAt })
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
      .input(z.object({
        listingId: z.number().int().positive(),
        title: z.string().trim().min(2).max(255).optional(),
        description: z.string().trim().max(10000).nullable().optional(),
        category: z.string().trim().min(2).max(64).optional(),
        pricePerDay: z.number().int().positive().optional(),
        imageUrl: z.string().trim().max(2000).nullable().optional(),
        city: z.string().trim().min(2).max(64).optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        fuelType: z.string().trim().max(32).nullable().optional(),
        transmission: z.string().trim().max(32).nullable().optional(),
        rooms: z.number().int().min(0).max(100).nullable().optional(),
        officeType: z.string().trim().max(64).nullable().optional(),
        rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).nullable().optional(),
        amenities: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
        isFeatured: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const { listingId, amenities, ...rest } = input;
        const [before] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'الإعلان غير موجود.' });
        const patch: Partial<typeof listings.$inferInsert> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) (patch as Record<string, unknown>)[key] = value === null ? null : value;
        }
        if (amenities !== undefined) patch.amenities = amenities.length ? amenities.join(',') : null;
        await db.update(listings).set(patch).where(eq(listings.id, listingId));
        await writeAuditLog({ actorId: ctx.user.id, action: 'listing.updated', entityType: 'listing', entityId: listingId, beforeData: before, afterData: input });
        return { success: true as const };
      }),
    createListing: adminProcedure
      .input(z.object({
        title: z.string().trim().min(2).max(255),
        description: z.string().trim().max(10000).optional(),
        category: z.string().trim().min(2).max(64),
        pricePerDay: z.number().int().positive(),
        imageUrl: z.string().trim().max(2000).optional(),
        city: z.string().trim().min(2).max(64).optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        fuelType: z.string().trim().max(32).nullable().optional(),
        transmission: z.string().trim().max(32).nullable().optional(),
        rooms: z.number().int().min(0).max(100).nullable().optional(),
        officeType: z.string().trim().max(64).nullable().optional(),
        rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).nullable().optional(),
        amenities: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
        isFeatured: z.boolean().optional(),
        status: z.enum(['Published', 'Available', 'Approved', 'Pending']).optional(),
        ownerId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const { amenities, status, isFeatured, ownerId, ...rest } = input;
        const [inserted] = await db.insert(listings).values({
          ...rest,
          ownerId: ownerId ?? ctx.user.id,
          isFeatured: isFeatured ?? false,
          status: status ?? 'Published',
          amenities: amenities?.length ? amenities.join(',') : null,
        }).returning({ insertId: listings.id });
        const listingId = Number(inserted.insertId);
        await writeAuditLog({ actorId: ctx.user.id, action: 'listing.created', entityType: 'listing', entityId: listingId, afterData: input });
        await safeNotifyUser({
          userId: ownerId ?? ctx.user.id,
          type: 'listing_approved',
          title: 'تم نشر إعلانك / Annonce publiée',
          message: `تم نشر الإعلان «${input.title}» من طرف الإدارة.\n\nL'annonce «${input.title}» a été publiée par l'administration.`,
          href: '/host',
          entityType: 'listing',
          entityId: listingId,
          dedupeKey: `listing-admin-created:${ownerId ?? ctx.user.id}:${listingId}`,
        });
        return { success: true as const, listingId };
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
      overviewKpis: superAdminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return { totalUsers: 0, activeCars: 0, activeRealEstate: 0, pendingQueue: 0 };
        const activeStatuses = ['Published', 'Approved', 'Available'] as const satisfies readonly string[];
        const activeStatusList = [...activeStatuses];
        const [userRows, carRows, realEstateRows, pendingRows] = await Promise.all([
          db.select({ value: count() }).from(users),
          db.select({ value: count() }).from(listings).where(and(eq(listings.category, 'car'), inArray(listings.status, activeStatusList))),
          db.select({ value: count() }).from(listings).where(and(eq(listings.category, 'real_estate'), inArray(listings.status, activeStatusList))),
          db.select({ value: count() }).from(listings).where(eq(listings.status, 'Pending')),
        ]);
        return {
          totalUsers: Number(userRows[0]?.value ?? 0),
          activeCars: Number(carRows[0]?.value ?? 0),
          activeRealEstate: Number(realEstateRows[0]?.value ?? 0),
          pendingQueue: Number(pendingRows[0]?.value ?? 0),
        };
      }),
      moderationQueue: superAdminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db.select({
          id: listings.id, title: listings.title, category: listings.category,
          status: listings.status, pricePerDay: listings.pricePerDay, pricePerMonth: listings.pricePerMonth,
          imageUrl: listings.imageUrl, city: listings.city, isFeatured: listings.isFeatured, createdAt: listings.createdAt,
          ownerId: listings.ownerId, ownerName: users.name, ownerEmail: users.email, ownerAgencyName: users.agencyName,
        }).from(listings).leftJoin(users, eq(listings.ownerId, users.id))
          .where(eq(listings.status, 'Pending')).orderBy(asc(listings.createdAt)).limit(100);
      }),
      moderate: superAdminProcedure
        .input(z.object({
          listingId: z.number().int().positive(),
          action: z.enum(['approve', 'reject']),
          reason: z.string().trim().max(500).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          const [before] = await db.select({ id: listings.id, ownerId: listings.ownerId, title: listings.title, status: listings.status, category: listings.category }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
          if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'الإعلان غير موجود.' });
          if (before.status === 'Rejected' || before.status === 'Published') {
            throw new TRPCError({ code: 'CONFLICT', message: `الإعلان محسوم بالفعل (${before.status}).` });
          }
          const nextStatus = input.action === 'approve' ? 'Published' : 'Rejected';
          await db.update(listings).set({ status: nextStatus }).where(eq(listings.id, input.listingId));
          await writeAuditLog({
            actorId: ctx.user!.id, action: `listing.${input.action === 'approve' ? 'approved' : 'rejected'}`,
            entityType: 'listing', entityId: input.listingId,
            beforeData: { status: before.status }, afterData: { status: nextStatus, reason: input.reason ?? null },
          });
          const reasonLabel = input.reason ? ` — ${input.reason}` : '';
          await safeNotifyUser({
            userId: before.ownerId,
            type: input.action === 'approve' ? 'listing_approved' : 'listing_rejected',
            title: input.action === 'approve' ? 'تم نشر إعلانك / Annonce publiée' : 'تم رفض إعلانك / Annonce refusée',
            message: `${input.action === 'approve' ? 'تم نشر' : 'تم رفض'} الإعلان «${before.title}».${reasonLabel}`,
            href: '/host', entityType: 'listing', entityId: input.listingId,
          });
          return { success: true as const, status: nextStatus };
        }),
      users: superAdminProcedure
        .input(z.object({
          q: z.string().trim().max(120).optional(),
          role: z.enum(['renter', 'owner', 'admin', 'partner', 'user', 'SUPER_ADMIN']).nullable().optional(),
          status: z.enum(['active', 'suspended', 'banned']).nullable().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const conditions = [];
          if (input.q?.trim()) {
            const needle = `%${input.q.trim()}%`;
            conditions.push(or(ilike(users.name, needle), ilike(users.email, needle), ilike(users.agencyName, needle), ilike(users.commercialRegister, needle)));
          }
          if (input.role) conditions.push(eq(users.role, input.role));
          if (input.status) conditions.push(eq(users.accountStatus, input.status));
          const limit = input.limit ?? 500;
          return db.select({
            id: users.id, name: users.name, email: users.email, whatsappPhone: users.whatsappPhone,
            agencyPhone: users.agencyPhone, agencyEmail: users.agencyEmail, agencyName: users.agencyName,
            commercialRegister: users.commercialRegister, role: users.role, accountStatus: users.accountStatus,
            kycVerificationStatus: users.kycVerificationStatus, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt,
          }).from(users)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(users.createdAt)).limit(limit);
        }),
      setUserRole: superAdminProcedure
        .input(z.object({ userId: z.number().int().positive(), role: z.enum(['renter', 'owner', 'admin', 'partner', 'user', 'SUPER_ADMIN']) }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          if (input.userId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تغيير دور حسابك الإداري بنفسك.' });
          const [before] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
          if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود.' });
          await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
          await writeAuditLog({ actorId: ctx.user.id, action: 'user.role_updated', entityType: 'user', entityId: input.userId, beforeData: before, afterData: { role: input.role } });
          return { success: true as const, role: input.role };
        }),
      setUserStatus: superAdminProcedure
        .input(z.object({ userId: z.number().int().positive(), status: z.enum(['active', 'suspended', 'banned']) }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة.' });
          if (input.userId === ctx.user.id && input.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تعطيل حسابك الإداري.' });
          const [before] = await db.select({ accountStatus: users.accountStatus }).from(users).where(eq(users.id, input.userId)).limit(1);
          if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود.' });
          await db.update(users).set({ accountStatus: input.status }).where(eq(users.id, input.userId));
          await writeAuditLog({ actorId: ctx.user.id, action: `user.${input.status}`, entityType: 'user', entityId: input.userId, beforeData: before, afterData: { accountStatus: input.status } });
          return { success: true as const, status: input.status };
        }),
      health: superAdminProcedure.query(async () => {
        const started = performance.now();
        let dbOk = false;
        let dbLatencyMs = 0;
        try {
          const db = await getDb();
          if (db) {
            await db.execute(sql`select 1`);
            dbOk = true;
            dbLatencyMs = Math.round(performance.now() - started);
          }
        } catch {
          dbOk = false;
          dbLatencyMs = Math.round(performance.now() - started);
        }
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        let whatsapp: { status: 'not_configured' | 'connected' | 'error'; latencyMs: number; message: string } = { status: 'not_configured', latencyMs: 0, message: '' };
        if (token && phoneNumberId) {
          const version = process.env.WHATSAPP_API_VERSION || 'v20.0';
          const waStarted = performance.now();
          try {
            const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}`, {
              method: 'GET',
              headers: { authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(4000),
            });
            const latencyMs = Math.round(performance.now() - waStarted);
            if (response.ok) {
              whatsapp = { status: 'connected', latencyMs, message: `HTTP ${response.status}` };
            } else {
              whatsapp = { status: 'error', latencyMs, message: `HTTP ${response.status}` };
            }
          } catch (error) {
            whatsapp = {
              status: 'error',
              latencyMs: Math.round(performance.now() - waStarted),
              message: error instanceof Error ? error.message.slice(0, 200) : 'المزود غير متاح.',
            };
          }
        }
        return {
          db: { ok: dbOk, latencyMs: dbOk ? dbLatencyMs : null },
          whatsapp: { ...whatsapp, configured: Boolean(token && phoneNumberId), webhookConfigured: false },
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.round(process.uptime()),
        };
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
        const [inserted] = await db.insert(supportTickets).values({ userId: ctx.user!.id, subject: input.subject, category: input.category, description: input.description, status: "Open" }).returning({ insertId: supportTickets.id });
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
        const [inserted] = await db.insert(disputes).values({ bookingId: input.bookingId, openedBy: ctx.user!.id, type: input.type, description: input.description, status: "Open" }).returning({ insertId: disputes.id });
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

        const reviewAgg = await db
          .select({
            listingId: reviews.listingId,
            average: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float8`,
            count: sql<number>`count(*)::int4`,
          })
          .from(reviews)
          .where(inArray(reviews.listingId, allListings.map(({ listing: item }) => item.id)))
          .groupBy(reviews.listingId);
        const reviewStats = new Map(reviewAgg.map((row) => [row.listingId, row]));

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
          return toPublicListing({
            ...item,
            ownerName: ownerName ?? null,
            dynamicPricePerDay: adjustedPrice,
            averageRating: reviewStats.get(item.id)?.average ?? 0,
            reviewCount: reviewStats.get(item.id)?.count ?? 0,
          });
        });
      }),

    search: publicProcedure
      .input(
        z.object({
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
          radiusKm: z.number().positive().max(500).optional(),
          city: z.string().trim().min(1).max(64).optional(),
          q: z.string().trim().max(200).optional(),
          type: z.enum(["all", "car", "property", "office"]).optional(),
          officeType: z.string().trim().max(64).optional(),
          rentalPeriod: z.enum(["daily", "monthly", "yearly"]).optional(),
          amenities: z.array(z.string()).max(10).optional(),
          minPrice: z.number().nonnegative().optional(),
          maxPrice: z.number().positive().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          sort: z.enum(["price-asc", "price-desc", "newest", "distance"]).optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(200).optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 50;
        if (!db) return { items: [], total: 0, page, pageSize, hasMore: false };

        const conds: (SQL | undefined)[] = [inArray(listings.status, ['Published', 'Available', 'Approved'])];

        if (input?.city && input.city !== "all") conds.push(eq(listings.city, input.city));

        if (input?.q?.trim()) {
          const q = `%${input.q.trim().toLowerCase()}%`;
          conds.push(or(ilike(listings.title, q), ilike(listings.description, q), ilike(listings.city, q), ilike(listings.category, q)));
        }

        if (input?.minPrice !== undefined || input?.maxPrice !== undefined) {
          if (input.minPrice !== undefined) conds.push(gte(listings.pricePerDay, input.minPrice));
          if (input.maxPrice !== undefined) conds.push(lte(listings.pricePerDay, input.maxPrice));
        }

        const carCond = or(ilike(listings.category, "%car%"), ilike(listings.category, "%سيارة%"))!;
        const officeCond = or(ilike(listings.category, "%office%"), ilike(listings.category, "%مكتب%"))!;
        if (input?.type && input.type !== "all") {
          if (input.type === "car") conds.push(carCond);
          else if (input.type === "office") conds.push(officeCond);
          else conds.push(and(not(carCond), not(officeCond)));
        }
        if (input?.type === "office" && input.officeType) {
          conds.push(eq(listings.officeType, input.officeType));
        }
        if (input?.type === "office" && input.rentalPeriod) {
          conds.push(eq(listings.rentalPeriod, input.rentalPeriod));
        }
        if (input?.type === "office" && Array.isArray(input.amenities) && input.amenities.length > 0) {
          conds.push(ilike(listings.amenities, `%${input.amenities.join("%")}%`));
        }

        let origin: { lat: number; lng: number } | null = null;
        if (input?.lat !== undefined && input?.lng !== undefined) {
          origin = { lat: input.lat, lng: input.lng };
          const radiusKm = input.radiusKm ?? 25;
          const deltaLat = radiusKm / 110.574;
          const deltaLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180)));
          conds.push(
            gte(listings.lat, origin.lat - deltaLat),
            lte(listings.lat, origin.lat + deltaLat),
            gte(listings.lng, origin.lng - deltaLng),
            lte(listings.lng, origin.lng + deltaLng),
            not(isNull(listings.lat)),
            not(isNull(listings.lng))
          );
        }

        const baseFilter = and(...conds);
        const rows = await db
          .select({ listing: listings, ownerName: users.name })
          .from(listings)
          .leftJoin(users, eq(listings.ownerId, users.id))
          .where(baseFilter)
          .orderBy(desc(listings.createdAt));

        const requestedRange = input?.startDate && input?.endDate ? parseDateRange(input.startDate, input.endDate) : null;
        const confirmedRanges = requestedRange
          ? await db.select({ listingId: bookings.listingId, start: bookings.startDate, end: bookings.endDate }).from(bookings).where(eq(bookings.status, "Confirmed"))
          : [];

        const reviewAgg = await db
          .select({
            listingId: reviews.listingId,
            average: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float8`,
            count: sql<number>`count(*)::int4`,
          })
          .from(reviews)
          .where(inArray(reviews.listingId, rows.map(({ listing: item }) => item.id)))
          .groupBy(reviews.listingId);
        const reviewStats = new Map(reviewAgg.map((row) => [row.listingId, row]));

        const enriched = rows
          .filter(({ listing: item }) => {
            if (!requestedRange) return true;
            const blockedRanges = [
              ...parseBlockedRanges(item.availability),
              ...parseBlockedRanges(item.icalImportedRanges),
              ...confirmedRanges.filter((range) => range.listingId === item.id).map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
            ];
            return isRangeAvailable(requestedRange, blockedRanges);
          })
          .map(({ listing: item, ownerName }) =>
            toPublicListing({
              ...item,
              ownerName: ownerName ?? null,
              distanceKm: origin && item.lat !== null && item.lng !== null ? haversineKm(origin.lat, origin.lng, item.lat, item.lng) : null,
              averageRating: reviewStats.get(item.id)?.average ?? 0,
              reviewCount: reviewStats.get(item.id)?.count ?? 0,
            }),
          );

        if (input?.sort === "price-asc") enriched.sort((a, b) => a.pricePerDay - b.pricePerDay);
        else if (input?.sort === "price-desc") enriched.sort((a, b) => b.pricePerDay - a.pricePerDay);
        else if (input?.sort === "distance") enriched.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

        const start = (page - 1) * pageSize;
        const items = enriched.slice(start, start + pageSize);
        return { items, total: enriched.length, page, pageSize, hasMore: start + items.length < enriched.length };
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
        const result = await db
          .select({
            listing: listings,
            ownerName: users.name,
            agencyName: users.agencyName,
            agencyPhone: users.agencyPhone,
            whatsappPhone: users.whatsappPhone,
          })
          .from(listings)
          .leftJoin(users, eq(listings.ownerId, users.id))
          .where(and(eq(listings.id, input.id), inArray(listings.status, ['Published', 'Available', 'Approved'])))
          .limit(1);
        if (!result[0]) {
          console.error(`Listing not found or not accessible. ID: ${input.id}, Status check: ['Published', 'Available', 'Approved']`);
          const fullListing = await db.select({ id: listings.id, status: listings.status }).from(listings).where(eq(listings.id, input.id)).limit(1);
          console.error(`Full listing debug - ID: ${input.id}, Actual status: ${fullListing[0]?.status || 'Not found'}`);
          return null;
        }

        const { listing, ownerName, agencyName, agencyPhone, whatsappPhone } = result[0];
        const sourceLanguage = "ar" as const;
        const targetLanguage = input.language ?? sourceLanguage;

        // If translation requested and different from source, fetch translations
        if (targetLanguage !== sourceLanguage && isTranslationAvailable() && listing.title) {
          const translated = await getTranslatedListing(
            { id: listing.id, title: listing.title, description: listing.description ?? null },
            targetLanguage,
            sourceLanguage
          );
          return toPublicListing({
            ...listing,
            title: translated.title ?? listing.title,
            description: translated.description ?? listing.description,
            _translationMeta: {
              titleFromCache: translated.titleFromCache,
              descriptionFromCache: translated.descriptionFromCache,
              titleProvider: translated.titleProvider,
              descriptionProvider: translated.descriptionProvider,
            },
            ownerName,
            agencyName,
            agencyPhone,
            whatsappPhone,
          });
        }

        return toPublicListing({ ...listing, _translationMeta: null, ownerName, agencyName, agencyPhone, whatsappPhone });
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

    setFleetStatus: ownerProcedure
      .input(z.object({ listingId: z.number().int().positive(), status: z.enum(['Available', 'Rented', 'Maintenance']) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const owned = await db.select({ id: listings.id, status: listings.status }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new TRPCError({ code: "NOT_FOUND", message: "الإعلان غير موجود ضمن ممتلكاتك." });
        await db.update(listings).set({ status: input.status }).where(and(eq(listings.id, input.listingId), eq(listings.ownerId, ctx.user!.id)));
        await writeAuditLog({ actorId: ctx.user!.id, action: "listing.fleet_status.updated", entityType: "listing", entityId: input.listingId, beforeData: { status: owned[0].status }, afterData: { status: input.status } });
        return { success: true as const, status: input.status };
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
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
          officeType: z.string().optional(),
          rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).optional(),
          amenities: z.array(z.string()).optional(),
          rooms: z.number().int().nonnegative().optional(),
          propertyType: z.string().trim().max(32).optional(),
          pricePerMonth: z.number().int().nonnegative().optional(),
          fuelType: z.string().trim().max(32).optional(),
          transmission: z.string().trim().max(32).optional(),
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
          lat: input.lat,
          lng: input.lng,
          officeType: input.officeType,
          rentalPeriod: input.rentalPeriod,
          amenities: input.amenities?.join(',') || null,
          rooms: input.rooms ?? 0,
          propertyType: input.propertyType,
          pricePerMonth: input.pricePerMonth,
          fuelType: input.fuelType ?? undefined,
          transmission: input.transmission ?? undefined,
          status: "Published",
        }).returning({ insertId: listings.id });
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
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        imageUrl: z.string().optional(),
        imageVerificationProof: z.string().optional(),
        officeType: z.string().optional(),
        rentalPeriod: z.enum(['daily', 'monthly', 'yearly']).optional(),
        amenities: z.array(z.string()).optional(),
        rooms: z.number().int().nonnegative().optional(),
        propertyType: z.string().trim().max(32).nullable().optional(),
        pricePerMonth: z.number().int().nonnegative().nullable().optional(),
        fuelType: z.string().trim().max(32).nullable().optional(),
        transmission: z.string().trim().max(32).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const { id, amenities, imageVerificationProof, ...fields } = input;
        const owned = await db.select({ id: listings.id, imageUrl: listings.imageUrl, status: listings.status, pricePerDay: listings.pricePerDay }).from(listings)
          .where(and(eq(listings.id, id), eq(listings.ownerId, ctx.user!.id))).limit(1);
        if (!owned[0]) throw new Error('الإعلان غير موجود ضمن ممتلكاتك.');
        if (fields.imageUrl !== undefined && (!imageVerificationProof || !verifyImageVerificationProof({ proof: imageVerificationProof, ownerId: ctx.user!.id, url: fields.imageUrl }))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يجب إعادة رفع الصورة عبر أداة الفحص الآمن قبل تعديلها." });
        }
        const nextStatus = owned[0].status === "Rejected" ? "Rejected" : "Published";
        await db.update(listings).set({ ...fields, ...(amenities ? { amenities: amenities.join(',') } : {}), status: nextStatus }).where(eq(listings.id, id));
        const priceChanged = fields.pricePerDay !== undefined && fields.pricePerDay !== owned[0].pricePerDay;
        await writeAuditLog({
          actorId: ctx.user!.id,
          action: priceChanged ? "listing.price_changed" : "listing.updated",
          entityType: "listing",
          entityId: id,
          beforeData: { pricePerDay: owned[0].pricePerDay },
          afterData: { pricePerDay: fields.pricePerDay ?? owned[0].pricePerDay, title: fields.title ?? null, transmission: fields.transmission ?? null, fuelType: fields.fuelType ?? null },
        });
        return { success: true, status: nextStatus };
      }),

    resubmitRejected: ownerProcedure
      .input(z.object({
        id: z.number().int().positive(),
        title: z.string().min(2),
        description: z.string().optional(),
        pricePerDay: z.number().int().nonnegative(),
        city: z.string().min(2),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
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
      if (!['owner', 'admin', 'partner'].includes(ctx.user!.role)) throw new Error('هذه الصفحة مخصصة للملاك.');
      return db.select().from(listings).where(eq(listings.ownerId, ctx.user!.id)).orderBy(desc(listings.createdAt));
    }),
  }),



  bookings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        if (ctx.user!.role === 'admin') {
          return await db.select().from(bookings).orderBy(desc(bookings.createdAt));
        }
        return await db.select().from(bookings).where(eq(bookings.renterId, ctx.user!.id));
      } catch (error) {
        console.error("[bookings.list] Failed to load bookings:", error);
        return [];
      }
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
          // Optional checkout add-ons. The server re-prices these from the
          // canonical catalog — client-sent amounts are never trusted.
          addOns: z
            .array(z.enum(["insurance", "baby_seat", "delivery", "additional_driver"]))
            .optional(),
          // Residency + the two mandatory checkout documents (driver's licence
          // and CIN/Passport). Files are stored server-side (Forge/S3) exactly
          // like KYC documents; the agency reviews them before handover.
          residency: z.enum(["resident", "foreigner"]).optional(),
          drivingLicense: z.object({
            fileName: z.string().trim().min(1).max(255),
            mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
            contentBase64: z.string().min(1).max(12_000_000),
          }).optional(),
          identityDocument: z.object({
            fileName: z.string().trim().min(1).max(255),
            mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
            contentBase64: z.string().min(1).max(12_000_000),
          }).optional(),
          // Airport pickup logistics (Mohammed V / Nouaceur) so the agency can
          // meet the renter at arrivals with the confirmed flight and time.
          flightNumber: z.string().trim().max(24).optional(),
          arrivalTime: z.string().optional(),
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
        const arrivalParsed = input.arrivalTime ? new Date(input.arrivalTime) : null;
        if (input.arrivalTime && (!arrivalParsed || Number.isNaN(arrivalParsed.getTime()))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "وقت وصول الرحلة غير صالح." });
        }
        const listing = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
        if (!listing[0]) throw new Error("الإعلان غير موجود.");
        // Maintenance mode blocks every overlapping date: a car in maintenance is
        // off the market until it returns to Available, so requests are rejected.
        if (listing[0].status === "Maintenance") {
          throw new TRPCError({ code: "CONFLICT", message: "السيارة في وضع الصيانة — الفترة محجوبة تلقائياً ولا يمكن حجزها." });
        }
        if (!["Published", "Available", "Approved"].includes(listing[0].status)) {
          throw new TRPCError({ code: "CONFLICT", message: "الإعلان غير متاح للحجز حالياً." });
        }
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
        const owner = await db.select({ id: users.id, name: users.name, email: users.email, whatsappPhone: users.whatsappPhone, agencyPhone: users.agencyPhone })
          .from(users).where(eq(users.id, listing[0].ownerId)).limit(1);

        const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (!Number.isInteger(durationDays) || durationDays <= 0) throw new Error("مدة الحجز غير صالحة.");
        const subtotal = listing[0].pricePerDay * durationDays;

        // Identity gate — the platform only accepts renters whose identity has
        // been verified with the document required for the listing category.
        await assertKycEligibleToBook({ db, user: ctx.user!, category: listing[0].category ?? null });

        // Add-ons are re-priced server-side from the canonical catalog so the
        // stored total always reconciles with the checkout preview.
        const selectedAddOns = (input.addOns ?? []).filter(isAddOnId);
        const addOnsTotal = calculateAddOnsTotal(selectedAddOns, durationDays);
        const addOnsSnapshot = selectedAddOns.map((id) => {
          const def = ADDONS_CATALOG[id];
          return { id, perDay: def.perDay, amount: def.perDay ? def.fee * durationDays : def.fee };
        });

        // Tier-aware, live commission split: recomputed from the database on
        // every booking so Commission Controller changes apply instantly.
        const commissionPolicy = await resolveEffectiveCommission(db, listing[0].ownerId, subtotal);
        const commissionFee = commissionPolicy.fee;
        const netProfit = (subtotal + addOnsTotal) - commissionFee;

        // Residency and documents are mandatory together: if the renter states
        // residency, the documents required for that listing category must be
        // attached and uploaded. Car bookings need the driving licence + ID,
        // while property (real estate/office) bookings only need the ID.
        const bookingCategory = normalizeBookingCategory(listing[0].category ?? null);
        if (input.residency) {
          if (bookingCategory === "car" && (!input.drivingLicense || !input.identityDocument)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "المرجو إرفاق رخصة السياقة ووثيقة الهوية مع حالة الإقامة." });
          }
          if (bookingCategory !== "car" && !input.identityDocument) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "المرجو إرفاق وثيقة الهوية مع حالة الإقامة." });
          }
        }
        const uploadCheckoutDocument = async (kind: "driving-license" | "identity", doc: { fileName: string; mimeType: string; contentBase64: string }) => {
          const bytes = Buffer.from(doc.contentBase64, "base64");
          if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الوثيقة يجب ألا يتجاوز 8 ميجابايت." });
          }
          const safeName = doc.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180) || (kind === "driving-license" ? "driving-license" : "identity-document");
          return storagePut(`users/${ctx.user!.id}/checkout/${kind}/${Date.now()}-${safeName}`, bytes, doc.mimeType);
        };
        const drivingLicenseFile = input.drivingLicense ? await uploadCheckoutDocument("driving-license", input.drivingLicense) : null;
        const identityDocumentFile = input.identityDocument ? await uploadCheckoutDocument("identity", input.identityDocument) : null;

        // Pending requests may overlap while awaiting approval. The owner/admin confirmation path below
        // takes the same row lock and performs the authoritative confirmed-overlap check.
        const policyAcceptedAt = new Date();
        const [inserted] = await db.insert(bookings).values({
          renterId: ctx.user!.id,
          listingId: input.listingId,
          startDate: start,
          endDate: end,
          totalPrice: subtotal + addOnsTotal,
          commissionFee,
          netProfit,
          addOns: addOnsSnapshot.length > 0 ? addOnsSnapshot : null,
          residency: input.residency ?? null,
          drivingLicenseKey: drivingLicenseFile?.key ?? null,
          drivingLicenseFileName: input.drivingLicense?.fileName ?? null,
          drivingLicenseMimeType: input.drivingLicense?.mimeType ?? null,
          identityDocumentKey: identityDocumentFile?.key ?? null,
          identityDocumentFileName: input.identityDocument?.fileName ?? null,
          identityDocumentMimeType: input.identityDocument?.mimeType ?? null,
          flightNumber: input.flightNumber?.trim() || null,
          arrivalTime: arrivalParsed,
          status: "Pending",
          cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
          cancellationPolicySnapshot: CANCELLATION_POLICY_TEXT,
          cancellationPolicyFingerprint: CANCELLATION_POLICY_FINGERPRINT,
          cancellationPolicyAcceptedAt: policyAcceptedAt,
          cancellationPolicyAcceptedBy: ctx.user!.id,
        }).returning({ insertId: bookings.id });
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

        // Instant WhatsApp alert to the agency when a booking is persisted with
        // the renter's verified KYC and checkout documents. Fire-and-forget so
        // a misconfigured provider never blocks the booking confirmation.
        void sendWhatsAppText(owner[0]?.whatsappPhone ?? owner[0]?.agencyPhone, [
          "ALTUSplace — حجز جديد / Nouvelle réservation",
          `رقم الحجز / Réservation: #${bookingId}`,
          `${bookingCategory === "car" ? "السيارة / Véhicule" : "العقار / Bien"}: ${listing[0].title}`,
          `الفترة / Période: ${dateLabel}`,
          `الإجمالي / Total: ${(subtotal + addOnsTotal).toLocaleString("fr-MA")} MAD`,
          `المستأجر / Client: ${ctx.user!.name ?? "عميل ALTUSplace"}`,
          "الوثائق مرفوعة والهوية محققة / Documents soumis, identité vérifiée",
        ].join("\n"));

        return { success: true, bookingId, subtotal, addOnsTotal, durationDays, commissionFee, netProfit };
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
        const bookingRow = (await db.select({ listingId: bookings.listingId }).from(bookings).where(eq(bookings.id, input.bookingId)).limit(1))[0];
        if (!bookingRow) throw new Error("الحجز غير موجود.");
        await db
          .update(bookings)
          .set({ status: input.status })
          .where(eq(bookings.id, input.bookingId));
        // Availability is derived from bookings: Confirming rents the listing
        // while Cancelling frees it — unless another confirmed booking exists.
        if (input.status === "Confirmed") {
          await db.update(listings).set({ status: "Rented" }).where(eq(listings.id, bookingRow.listingId));
        } else if (input.status === "Cancelled") {
          const otherActive = await db.select({ id: bookings.id }).from(bookings).where(and(
            eq(bookings.listingId, bookingRow.listingId),
            eq(bookings.status, "Confirmed"),
            ne(bookings.id, input.bookingId),
          )).limit(1);
          if (otherActive.length === 0) {
            await db.update(listings).set({ status: "Available" }).where(eq(listings.id, bookingRow.listingId));
          }
        }
        return { success: true };
      }),

    ownerList: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!['owner', 'admin', 'partner'].includes(ctx.user!.role)) throw new Error('هذه العملية مخصصة للملاك.');
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
        residency: bookings.residency,
        drivingLicenseKey: bookings.drivingLicenseKey,
        drivingLicenseFileName: bookings.drivingLicenseFileName,
        drivingLicenseMimeType: bookings.drivingLicenseMimeType,
        identityDocumentKey: bookings.identityDocumentKey,
        identityDocumentFileName: bookings.identityDocumentFileName,
        identityDocumentMimeType: bookings.identityDocumentMimeType,
        flightNumber: bookings.flightNumber,
        arrivalTime: bookings.arrivalTime,
        listingTitle: listings.title,
        category: listings.category,
        renterName: users.name,
        renterEmail: users.email,
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
        if (!['owner', 'admin', 'partner'].includes(ctx.user!.role)) throw new Error('هذه العملية مخصصة للملاك.');
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
            // Row lock (SELECT ... FOR UPDATE) serializes confirmations for the same listing.
            await tx.execute(sql`SELECT listing_id FROM listings WHERE listing_id = ${booking.listingId} FOR UPDATE`);
            const currentListing = await tx.select({ status: listings.status, availability: listings.availability, icalImportedRanges: listings.icalImportedRanges }).from(listings).where(eq(listings.id, booking.listingId)).limit(1);
            if (currentListing[0]?.status === "Maintenance") {
              throw new Error("لا يمكن قبول الحجز لأن السيارة في وضع الصيانة — الفترة محجوبة تلقائياً.");
            }
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
          return tx.update(bookings).set({ status: input.status }).where(and(eq(bookings.id, input.bookingId), eq(bookings.status, "Pending"))).returning({ id: bookings.id });
        });
        if (updated.length === 0) throw new Error("تم تحديث الحجز من مستخدم آخر؛ أعد تحميل الصفحة.");

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
        await writeAuditLog({
          actorId: ctx.user!.id,
          action: accepted ? "booking.approved" : "booking.rejected",
          entityType: "booking",
          entityId: bookingDetails[0].bookingId,
          beforeData: { status: "Pending" },
          afterData: { status: input.status, listingTitle: bookingDetails[0].listingTitle },
        });
        return { success: true };
      }),
  }),

  payments: router({
    exchangeRates: publicProcedure.query(async () => resolveExchangeRates()),
    transactionStatus: protectedProcedure
      .input(z.object({ transactionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const rows = await db.select({
          id: transactions.id,
          bookingId: transactions.bookingId,
          gateway: transactions.gateway,
          status: transactions.status,
          amount: transactions.amount,
          currency: transactions.currency,
          externalReference: transactions.externalReference,
          expiresAt: transactions.expiresAt,
          createdAt: transactions.createdAt,
          bookingRenterId: bookings.renterId,
        }).from(transactions)
          .innerJoin(bookings, eq(transactions.bookingId, bookings.id))
          .where(eq(transactions.id, input.transactionId)).limit(1);
        const row = rows[0];
        if (!row || (ctx.user!.role !== "admin" && row.bookingRenterId !== ctx.user!.id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المعاملة غير موجودة." });
        }
        return {
          id: row.id,
          bookingId: row.bookingId,
          gateway: row.gateway,
          status: row.status,
          amount: row.amount,
          currency: row.currency,
          externalReference: row.externalReference,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
        };
      }),
    create: protectedProcedure
      .input(z.object({
        bookingId: z.number().int().positive(),
        method: z.enum(["cmi_card", "bank_transfer", "stripe_card", "paypal", "payzone", "paytabs", "cashplus", "wafacash", "arrival"]),
        currency: z.enum(["MAD", "EUR", "USD"]).default("MAD"),
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

        // Identity gate: a verified identity with the document required for the
        // listing category is mandatory before any money moves.
        const paymentListing = await db.select({ category: listings.category }).from(listings)
          .where(eq(listings.id, booking.listingId)).limit(1);
        await assertKycEligibleToBook({
          db,
          user: ctx.user!,
          category: paymentListing[0]?.category ?? null,
        });

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

        if (!gatewaySupportsCurrency(input.method, input.currency)) {
          throw new Error("طريقة الدفع هذه غير مدعومة بالعملة المختارة.");
        }

        // Owner record is needed for the real Stripe Connect destination and for escrow.
        const escrowListing = await db.select({
          ownerId: listings.ownerId,
          category: listings.category,
          stripeAccountId: users.stripeAccountId,
        }).from(listings)
          .leftJoin(users, eq(listings.ownerId, users.id))
          .where(eq(listings.id, booking.listingId)).limit(1);

        // Amounts are computed in MAD then converted with the server-authoritative
        // rate snapshot (same 10-min TTL + endpoint contract as the client's
        // VITE_CURRENCY_API_URL). The escrow ledger always stays in MAD.
        const exchangeRates = await resolveExchangeRates();
        const convertedTotal = Math.max(1, convertFromMAD(totals.total, input.currency, exchangeRates));
        const convertedSubtotal = Math.max(0, convertFromMAD(totals.subtotal, input.currency, exchangeRates));
        const convertedCommission = Math.max(0, convertFromMAD(totals.commissionFee, input.currency, exchangeRates));
        const convertedVat = convertedTotal - convertedSubtotal;

        const charge = await createProviderCharge({
          gateway: input.method as GatewayCode,
          amount: convertedTotal,
          currency: input.currency,
          bookingId: booking.id,
          payerId: booking.renterId,
          transferAccountId: escrowListing[0]?.stripeAccountId ?? null,
        });
        let paymentStatus = charge.status;
        let providerReference = charge.providerReference;

        // ── Moroccan gateway plan ─────────────────────────────────────────────
        // PayZone/PayTabs create a real redirect charge when configured;
        // Cash Plus / Wafacash generate an offline voucher reference valid for
        // 24h; Arrival records a pending on-site payment. Every one of them is
        // tracked in the transactions ledger and reconciled by the verified
        // /api/webhooks/* endpoints (see server/payments/webhooks.ts).
        const requestOrigin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
        const isGatewayTransaction = input.method === "payzone" || input.method === "paytabs"
          || input.method === "cashplus" || input.method === "wafacash" || input.method === "arrival";
        let gatewayRedirect: GatewayRedirect = null;
        let transactionExternalReference: string | null = null;
        let gatewayExpiresAt: Date | null = null;
        let gatewayPayload: Record<string, unknown> | null = null;

        if (input.method === "payzone" && isPayzoneConfigured()) {
          const orderRef = createPayzoneOrderRef(booking.id);
          const redirect = buildPayzoneRedirect({
            amount: convertedTotal,
            currency: input.currency,
            orderRef,
            returnUrl: `${requestOrigin}/my-bookings`,
            cancelUrl: `${requestOrigin}/checkout?listingId=${booking.listingId}`,
            callbackUrl: `${requestOrigin}/api/webhooks/payzone`,
            cardHolderName: ctx.user!.name,
            cardHolderEmail: ctx.user!.email,
          });
          paymentStatus = "Pending";
          providerReference = orderRef;
          transactionExternalReference = orderRef;
          gatewayPayload = { provider: "payzone" };
          gatewayRedirect = { kind: "redirect", provider: "payzone", url: redirect.url, externalReference: orderRef };
        } else if (input.method === "paytabs" && isPaytabsConfigured()) {
          const orderId = createPaytabsOrderId(booking.id);
          const paytabsTxn = await createPaytabsTransaction({
            amount: convertedTotal,
            currency: input.currency,
            orderId,
            returnUrl: `${requestOrigin}/my-bookings`,
            callbackUrl: `${requestOrigin}/api/webhooks/paytabs`,
            customer: { name: ctx.user!.name, email: ctx.user!.email },
          });
          paymentStatus = "Pending";
          providerReference = paytabsTxn.tranRef;
          transactionExternalReference = orderId;
          gatewayPayload = { provider: "paytabs", salt: paytabsTxn.salt, tranRef: paytabsTxn.tranRef };
          gatewayRedirect = { kind: "redirect", provider: "paytabs", url: paytabsTxn.redirectUrl, externalReference: orderId };
        } else if (input.method === "cashplus" || input.method === "wafacash") {
          transactionExternalReference = await reserveCashVoucherReference(db, input.method);
          gatewayExpiresAt = cashVoucherExpiry();
          gatewayPayload = { provider: input.method, expiresAt: gatewayExpiresAt.toISOString() };
          gatewayRedirect = { kind: "voucher", provider: input.method, reference: transactionExternalReference, expiresAt: gatewayExpiresAt };
        } else if (input.method === "arrival") {
          transactionExternalReference = `ARRIVAL-${booking.id}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
          gatewayPayload = { provider: "arrival", note: "الدفع عند الاستلام" };
        }

        // The prototype keeps the simulated flag literal (audit contract); the
        // real Stripe Connect branch still records a real providerReference.
        const [paymentInsert] = await db.insert(payments).values({
          bookingId: booking.id,
          payerId: booking.renterId,
          method: input.method,
          status: paymentStatus,
          amount: convertedTotal,
          currency: input.currency,
          providerReference,
          simulated: true,
        }).returning({ insertId: payments.id });
        const paymentId = Number(paymentInsert.insertId);
        const [invoiceInsert] = await db.insert(invoices).values({
          invoiceNumber: createInvoiceNumber(booking.id),
          bookingId: booking.id,
          paymentId,
          payerId: booking.renterId,
          subtotal: convertedSubtotal,
          commissionFee: convertedCommission,
          vatRateBasisPoints: totals.vatRateBasisPoints,
          vatAmount: convertedVat,
          total: convertedTotal,
          currency: input.currency,
          status: paymentStatus === "Succeeded" ? "Issued" : "Pending",
          cancellationPolicyVersion: booking.cancellationPolicyVersion ?? CANCELLATION_POLICY_VERSION,
          cancellationPolicySnapshot: booking.cancellationPolicySnapshot ?? CANCELLATION_POLICY_TEXT,
          cancellationPolicyFingerprint: booking.cancellationPolicyFingerprint ?? CANCELLATION_POLICY_FINGERPRINT,
          cancellationPolicyAcceptedAt: booking.cancellationPolicyAcceptedAt ?? new Date(),
          cancellationPolicyAcceptedBy: booking.cancellationPolicyAcceptedBy ?? booking.renterId,
        }).returning({ insertId: invoices.id });
        const invoiceId = Number(invoiceInsert.insertId);
        const createdInvoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
        const createdPayment = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);

        // ── Gateway transaction ledger (Moroccan gateways) ──────────────────
        let createdTransaction: typeof transactions.$inferSelect | null = null;
        if (isGatewayTransaction) {
          createdTransaction = await insertGatewayTransaction(db, {
            bookingId: booking.id,
            gateway: input.method as "payzone" | "paytabs" | "cashplus" | "wafacash" | "arrival",
            amount: convertedTotal,
            currency: input.currency,
            status: "pending",
            externalReference: transactionExternalReference,
            expiresAt: gatewayExpiresAt,
            rawPayload: gatewayPayload,
          });
        }
        // Multi-vendor escrow: once a confirmed booking is paid, hold the split
        // in the escrow ledger until the release date (booking end date).
        if (paymentStatus === "Succeeded" && booking.status === "Confirmed") {
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
            }).returning({ insertId: bookingVouchers.id });
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
        return { payment: createdPayment[0], invoice: createdInvoice[0], voucher, transaction: createdTransaction, gatewayRedirect };
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
      try {
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
      } catch (error) {
        console.error("[invoices.list] Failed to load invoices:", error);
        return [];
      }
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
        }).returning({ insertId: commercialLeaseContracts.id });
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

  rentalContracts: router({
    // Generates the standard Moroccan car rental contract ("Contrat de Location
    // de Véhicule") pre-filled with the confirmed booking and the renter's
    // verified KYC identity. PDFs are stored securely and surfaced via the
    // /manus-storage proxy; the agency downloads it from its dashboard.
    createForBooking: ownerProcedure
      .input(z.object({
        bookingId: z.number().int().positive(),
        language: z.enum(["ar", "fr"]).default("ar"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const rows = await db.select({
          id: bookings.id,
          bookingStatus: bookings.status,
          renterId: bookings.renterId,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
          totalPrice: bookings.totalPrice,
          commissionFee: bookings.commissionFee,
          netProfit: bookings.netProfit,
          addOns: bookings.addOns,
          residency: bookings.residency,
          listingId: listings.id,
          listingTitle: listings.title,
          category: listings.category,
          pricePerDay: listings.pricePerDay,
          fuelType: listings.fuelType,
          transmission: listings.transmission,
          city: listings.city,
          ownerId: listings.ownerId,
        }).from(bookings)
          .innerJoin(listings, eq(bookings.listingId, listings.id))
          .where(and(eq(bookings.id, input.bookingId), eq(listings.ownerId, ctx.user!.id)))
          .limit(1);
        const booking = rows[0];
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "الحجز غير موجود ضمن إعلاناتك." });
        if (booking.bookingStatus !== "Confirmed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن توليد عقد الكراء قبل اعتماد الحجز." });
        }
        const [agencyRow, renterRow, kycRows] = await Promise.all([
          db.select({
            agencyName: users.agencyName,
            agencyPhone: users.agencyPhone,
            agencyAddress: users.agencyAddress,
            commercialRegister: users.commercialRegister,
            whatsappPhone: users.whatsappPhone,
          }).from(users).where(eq(users.id, booking.ownerId)).limit(1),
          db.select({ name: users.name, email: users.email, whatsappPhone: users.whatsappPhone }).from(users).where(eq(users.id, booking.renterId)).limit(1),
          db.select({
            documentType: kycSubmissions.documentType,
            documentNumberMasked: kycSubmissions.documentNumberMasked,
            status: kycSubmissions.status,
          }).from(kycSubmissions).where(eq(kycSubmissions.userId, booking.renterId)).limit(3),
        ]);
        const agency = agencyRow[0];
        const renter = renterRow[0];
        const verifiedIdentity = (kycRows ?? []).find(
          (row) => row.status === "Approved" && ["cni", "national_id", "passport"].includes(row.documentType),
        ) ?? (kycRows ?? []).find((row) => row.status === "Approved");
        const start = new Date(booking.startDate);
        const end = new Date(booking.endDate);
        const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        const addOnsTotal = Array.isArray(booking.addOns)
          ? (booking.addOns as Array<{ amount?: number | string }>).reduce((sum, item) => sum + Number(item?.amount ?? 0), 0)
          : 0;
        const subtotal = Number(booking.pricePerDay ?? 0) * durationDays;
        const totalPrice = Number(booking.totalPrice ?? (subtotal + addOnsTotal));
        const reference = `ALT-CAR-${booking.id}-${start.toISOString().slice(0, 10)}`;
        const legalNotice = input.language === "ar"
          ? "تنبيه قانوني: هذا عقد نموذجي تم توليده بعد اعتماد الحجز والتحقق من هوية المستأجر عبر منصة ALTUSplace، ويستحسن مراجعته من طرف محامٍ أو موثق مغربي قبل الاستعمال الفعلي."
          : "Avertissement légal : ce contrat type est généré après confirmation de la réservation et vérification de l'identité du locataire via ALTUSplace. Il convient de le faire valider par un avocat ou un notaire au Maroc avant toute utilisation réelle.";
        const pdfBuffer = generateCarRentalContractPdf({
          reference,
          language: input.language,
          agencyName: agency?.agencyName || "وكالة التأجير / Agence de location",
          agencyCommercialRegister: agency?.commercialRegister ?? null,
          agencyAddress: agency?.agencyAddress ?? null,
          agencyPhone: agency?.agencyPhone ?? agency?.whatsappPhone ?? null,
          renterName: renter?.name || `مستأجر #${booking.renterId}`,
          renterEmail: renter?.email ?? null,
          renterPhone: renter?.whatsappPhone ?? null,
          renterIdType: verifiedIdentity?.documentType ?? null,
          renterIdNumber: verifiedIdentity?.documentNumberMasked ?? null,
          residency: booking.residency ?? null,
          vehicle: booking.listingTitle ?? `الإعلان #${booking.listingId}`,
          vehicleCategory: booking.category,
          fuelType: booking.fuelType ?? null,
          transmission: booking.transmission ?? null,
          city: booking.city ?? null,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          durationDays,
          pricePerDay: Number(booking.pricePerDay ?? 0),
          addOnsTotal,
          subtotal,
          commissionFee: Number(booking.commissionFee ?? 0),
          netProfit: Number(booking.netProfit ?? 0),
          totalPrice,
          deposit: 0,
          cancelPolicyText: CANCELLATION_POLICY_TEXT,
          legalNotice,
          issuedAt: new Date().toISOString(),
        });
        const stored = await storagePut(`contracts/car-rental/${reference}.pdf`, pdfBuffer, "application/pdf");
        await writeAuditLog({
          actorId: ctx.user!.id,
          action: "rental_contract.generated",
          entityType: "booking",
          entityId: booking.id,
          afterData: { reference, pdfUrl: stored.url },
        });
        return { success: true as const, reference, pdfUrl: stored.url };
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

    summary: publicProcedure
      .input(z.object({ listingId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { average: 0, count: 0 };
        const [row] = await db
          .select({
            average: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float8`,
            count: sql<number>`count(*)::int4`,
          })
          .from(reviews)
          .where(eq(reviews.listingId, input.listingId))
          .limit(1);
        return { average: row?.average ?? 0, count: row?.count ?? 0 };
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
