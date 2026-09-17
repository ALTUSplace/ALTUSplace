import type { Request, Response } from "express";
import { and, eq, ilike, inArray, lt, or } from "drizzle-orm";
import {
  bookingMessages,
  bookings,
  bookingVouchers,
  commercialLeaseContracts,
  escrowEntries,
  invoices,
  listingAnalyticsEvents,
  listingComments,
  listings,
  payments,
  refundRequests,
  reviews,
  users,
} from "../../drizzle/schema";
import { getDb, withTransaction } from "../db";
import { logger } from "../_core/logger";

const DEMO_OWNER_OPENID = "demo-owner-altusplace";
const DEMO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function demoCleanupHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    // Only ever run on environments that explicitly opt into demo data.
    if (process.env.DEMO_SEED !== "1") {
      return res.json({ success: true, skipped: true, deleted: 0, reason: "DEMO_SEED not set" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", timestamp });

    const cutoff = new Date(Date.now() - DEMO_RETENTION_MS);
    const demoOwnerRows = await db.select({ id: users.id }).from(users).where(eq(users.openId, DEMO_OWNER_OPENID)).limit(50);
    const ownerIds = demoOwnerRows.map((row) => row.id);

    const demoListingRows = await db.select({ id: listings.id }).from(listings)
      .where(and(
        lt(listings.createdAt, cutoff),
        or(inArray(listings.ownerId, ownerIds.length ? ownerIds : [-1]), ilike(listings.title, "%رينو كليو%")),
      ))
      .limit(500); // bound a single run; older demo data is removed in later runs
    const listingIds = demoListingRows.map((row) => row.id);

    if (listingIds.length === 0) {
      logger.info("[DemoCleanupCron] No demo data older than 30 days", { cutoff });
      return res.json({ success: true, skipped: true, deleted: 0, reason: "no_demo_data_older_than_30d" });
    }

    logger.info("[DemoCleanupCron] Demo data found", { listingIds: listingIds.length });

    const demoBookingRows = await db.select({ id: bookings.id }).from(bookings)
      .where(or(inArray(bookings.listingId, listingIds), inArray(bookings.secondaryListingId, listingIds)));
    const bookingIds = demoBookingRows.map((row) => row.id);

    const details = await withTransaction(async (tx) => {
      const paymentRows = bookingIds.length
        ? await tx.delete(payments).where(inArray(payments.bookingId, bookingIds)).returning({ id: payments.id })
        : [];
      // Child-first deletion so no orphaned rows survive cleanup.
      if (bookingIds.length) {
        await tx.delete(bookingMessages).where(inArray(bookingMessages.bookingId, bookingIds));
        await tx.delete(bookingVouchers).where(inArray(bookingVouchers.bookingId, bookingIds));
        await tx.delete(escrowEntries).where(inArray(escrowEntries.bookingId, bookingIds));
        await tx.delete(refundRequests).where(inArray(refundRequests.bookingId, bookingIds));
        await tx.delete(commercialLeaseContracts).where(inArray(commercialLeaseContracts.bookingId, bookingIds));
        await tx.delete(reviews).where(or(inArray(reviews.bookingId, bookingIds), inArray(reviews.listingId, listingIds)));
      }
      const invoiceRows = bookingIds.length
        ? await tx.delete(invoices).where(inArray(invoices.bookingId, bookingIds)).returning({ id: invoices.id })
        : [];
      await tx.delete(listingComments).where(inArray(listingComments.listingId, listingIds));
      await tx.delete(listingAnalyticsEvents).where(inArray(listingAnalyticsEvents.listingId, listingIds));
      const bookingRows = await tx.delete(bookings)
        .where(or(inArray(bookings.listingId, listingIds), inArray(bookings.secondaryListingId, listingIds)))
        .returning({ id: bookings.id });
      const listingRows = await tx.delete(listings).where(inArray(listings.id, listingIds)).returning({ id: listings.id });
      const ownerRows = ownerIds.length
        ? await tx.delete(users).where(inArray(users.id, ownerIds)).returning({ id: users.id })
        : [];
      return {
        owners: ownerRows.length,
        listings: listingRows.length,
        bookings: bookingRows.length,
        payments: paymentRows.length,
        invoices: invoiceRows.length,
      };
    });

    const deleted = details.owners + details.listings + details.bookings + details.payments + details.invoices;
    logger.info("[DemoCleanupCron] Cleanup complete", details);
    return res.json({ success: true, deleted, details });
  } catch (error) {
    console.error("[DemoCleanupCron] Handler failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), timestamp });
  }
}