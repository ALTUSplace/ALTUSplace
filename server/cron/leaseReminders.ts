import type { Request, Response } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { bookings, listings, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildEmailContent, safeNotifyUser, sendTransactionalEmail, sendWhatsAppText } from "../notificationService";
import { logger } from "../_core/logger";

const REMINDER_HOURS_MS = 48 * 60 * 60 * 1000;
const CRON_WINDOW_MS = 60 * 60 * 1000; // hourly scheduler: tolerate ±1h around the exact 48h mark
const MAX_BOOKINGS_PER_RUN = 500;

export async function leaseRemindersHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", timestamp });

    const target = new Date(Date.now() + REMINDER_HOURS_MS);
    const from = new Date(target.getTime() - CRON_WINDOW_MS);
    const to = new Date(target.getTime() + CRON_WINDOW_MS);

    const rows = await db.select({
      id: bookings.id,
      listingId: bookings.listingId,
      renterId: bookings.renterId,
      startDate: bookings.startDate,
      endDate: bookings.endDate,
      listingTitle: listings.title,
      renterName: users.name,
      renterEmail: users.email,
      renterPhone: users.whatsappPhone,
    }).from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(users, eq(bookings.renterId, users.id))
      .where(and(
        eq(bookings.status, "Confirmed"),
        gte(bookings.endDate, from),
        lte(bookings.endDate, to),
      ))
      .limit(MAX_BOOKINGS_PER_RUN);

    logger.info("[LeaseRemindersCron] Matching bookings", { dueWithinWindow: rows.length });

    let sent = 0;
    for (const row of rows) {
      const endLabel = new Date(row.endDate).toLocaleDateString("fr-MA");
      const title = "ينتهي حجزك خلال 48 ساعة / Votre réservation se termine dans 48 heures";
      const message =
        `مرحباً ${row.renterName ?? ""}\n` +
        `ينتهي حجزك للإعلان «${row.listingTitle}» بتاريخ ${endLabel}. نتمنى لك رحلة ممتعة!\n` +
        `Bonjour ${row.renterName ?? ""}\n` +
        `Votre réservation pour «${row.listingTitle}» se termine le ${endLabel}. Bon retour !`;

      // WhatsApp + email reminder via the existing notificationService.
      const whatsapp = await sendWhatsAppText(row.renterPhone, message);
      const email = row.renterEmail
        ? await sendTransactionalEmail({ to: row.renterEmail, subject: title, ...buildEmailContent(title, message, "/my-bookings") })
        : { status: "skipped", reason: "no_renter_email" as const };

      // In-app notification (deduped so cron retries never duplicate).
      const persisted = await safeNotifyUser({
        userId: row.renterId,
        type: "system",
        title,
        message,
        href: "/my-bookings",
        entityType: "booking",
        entityId: row.id,
        dedupeKey: `booking-expiring-${row.id}`,
      });

      const delivered = whatsapp.status === "sent" || email.status === "sent" || persisted !== null;
      if (delivered) sent += 1;
      logger.info("[LeaseRemindersCron] Reminder dispatched", {
        bookingId: row.id,
        whatsapp: whatsapp.status,
        email: email.status,
        inApp: persisted !== null,
      });
    }

    return res.json({ success: true, sent, windowMs: CRON_WINDOW_MS });
  } catch (error) {
    console.error("[LeaseRemindersCron] Handler failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), timestamp });
  }
}