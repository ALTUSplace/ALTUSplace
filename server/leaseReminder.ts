import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { bookings, commercialLeaseContracts, listings, notifications, users } from "../drizzle/schema";
import { getDb } from "./db";
import { buildEmailContent, safeNotifyUser } from "./notificationService";
import { sdk } from "./_core/sdk";

const REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function leaseEndReminderHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });

    const contractRows = await db.select({
      contract: commercialLeaseContracts,
      listingTitle: listings.title,
      tenantEmail: users.email,
    }).from(commercialLeaseContracts)
      .innerJoin(bookings, eq(commercialLeaseContracts.bookingId, bookings.id))
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .leftJoin(users, eq(commercialLeaseContracts.tenantId, users.id))
      .where(eq(commercialLeaseContracts.leaseEndReminderTaskUid, user.taskUid))
      .limit(1);

    const row = contractRows[0];
    if (!row) return res.json({ ok: true, skipped: "orphan" });

    const now = Date.now();
    const endAt = new Date(row.contract.endDate).getTime();
    if (!Number.isFinite(endAt) || endAt <= now) {
      return res.json({ ok: true, skipped: "expired" });
    }
    if (endAt - now > REMINDER_WINDOW_MS) {
      return res.json({ ok: true, skipped: "not_due" });
    }

    // Idempotency guard: platform retries and daily executions must not duplicate the reminder.
    const alreadySent = await db.select({ id: notifications.id })
      .from(notifications)
      .where(and(
        eq(notifications.userId, row.contract.tenantId),
        eq(notifications.type, "lease_expiring"),
        eq(notifications.entityType, "commercial_lease_contract"),
        eq(notifications.entityId, row.contract.id),
      ))
      .limit(1);
    if (alreadySent[0]) return res.json({ ok: true, skipped: "already_notified" });

    const title = "ينتهي عقد الكراء خلال 48 ساعة / Votre bail expire dans 48 heures";
    const message = `سينتهي عقد كراء «${row.listingTitle}» بتاريخ ${new Date(row.contract.endDate).toLocaleDateString("fr-MA")}. يرجى التواصل مع المالك لتجديد العقد أو الاستعداد للمغادرة.\nLe bail de «${row.listingTitle}» expire le ${new Date(row.contract.endDate).toLocaleDateString("fr-MA")}. Contactez le propriétaire pour renouveler ou préparez votre départ.`;
    const email = row.tenantEmail ? buildEmailContent(title, message, "/my-bookings") : undefined;

    await safeNotifyUser({
      userId: row.contract.tenantId,
      type: "lease_expiring",
      title,
      message,
      href: "/my-bookings",
      entityType: "commercial_lease_contract",
      entityId: row.contract.id,
      email: row.tenantEmail ? { to: row.tenantEmail, subject: title, ...buildEmailContent(title, message, "/my-bookings") } : undefined,
    });

    return res.json({ ok: true, notified: row.contract.tenantId, emailConfigured: Boolean(email) });
  } catch (error) {
    console.error("[LeaseReminder] Handler failed:", error);
    // L-6: never return a stack trace (or other internals) to the caller —
    // the full error stays in the server log above; the response carries only
    // the message plus non-sensitive context.
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      context: { url: req.originalUrl ?? req.url, taskUid: "authenticated-task" },
      timestamp,
    });
  }
}
