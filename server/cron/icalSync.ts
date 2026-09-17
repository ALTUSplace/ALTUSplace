import type { Request, Response } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import { bookings, listings } from "../../drizzle/schema";
import { getDb } from "../db";
import { parseIcalEvents, validateIcalImportUrl } from "../../shared/ical";
import { overlaps, type DateRange } from "../availability";
import { logger } from "../_core/logger";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_EVENTS_PER_FEED = 200;
const MAX_LISTINGS_PER_RUN = 200;

type IcalConflict = {
  start: string;
  end: string;
  bookingId: number;
};

function rangeFromIcalDate(start: string, end: string): DateRange | null {
  const startDate = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
  const endDate = new Date(`${end.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) return null;
  return { start: startDate, end: endDate };
}

async function findIcalBookingConflicts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  listingId: number,
  ranges: Array<{ start: string; end: string }>,
): Promise<IcalConflict[]> {
  if (ranges.length === 0) return [];
  const confirmed = await db
    .select({ id: bookings.id, startDate: bookings.startDate, endDate: bookings.endDate })
    .from(bookings)
    .where(and(eq(bookings.listingId, listingId), eq(bookings.status, "Confirmed")));
  if (confirmed.length === 0) return [];

  const conflicts: IcalConflict[] = [];
  for (const range of ranges) {
    const parsed = rangeFromIcalDate(range.start, range.end);
    if (!parsed) continue;
    for (const booking of confirmed) {
      if (overlaps(parsed, { start: new Date(booking.startDate), end: new Date(booking.endDate) })) {
        conflicts.push({ start: range.start.slice(0, 10), end: range.end.slice(0, 10), bookingId: booking.id });
      }
    }
  }
  return conflicts;
}

export async function icalSyncHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", timestamp });

    const listingRows = await db
      .select({ id: listings.id, icalImportUrl: listings.icalImportUrl })
      .from(listings)
      .where(isNotNull(listings.icalImportUrl))
      .limit(MAX_LISTINGS_PER_RUN);

    const results: Array<Record<string, unknown>> = [];
    let synced = 0;
    let totalConflicts = 0;

    logger.info("[IcalSyncCron] Starting sync", { listings: listingRows.length });

    for (const listing of listingRows) {
      if (!listing.icalImportUrl) continue;
      try {
        const url = validateIcalImportUrl(listing.icalImportUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let resp: globalThis.Response;
        try {
          resp = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "text/calendar,text/plain;q=0.9" },
          });
        } finally {
          clearTimeout(timeout);
        }
        if (!resp.ok) throw new Error(`iCal HTTP ${resp.status}`);
        const body = await resp.text();
        if (body.length > 1_000_000) throw new Error("iCal feed exceeds 1 MB");

        const ranges = parseIcalEvents(body, MAX_EVENTS_PER_FEED);

        // Detect conflicts with existing confirmed bookings BEFORE persisting
        // the imported ranges, so an external calendar can never silently
        // expose an already-booked period as available.
        const conflicts = await findIcalBookingConflicts(db, listing.id, ranges);

        await db.update(listings).set({
          icalImportedRanges: JSON.stringify(ranges),
          icalLastSyncedAt: new Date(),
          icalSyncStatus: "ok",
          icalSyncError: null,
        }).where(eq(listings.id, listing.id));

        synced += 1;
        totalConflicts += conflicts.length;
        logger.info("[IcalSyncCron] Listing synced", { listingId: listing.id, events: ranges.length, conflicts: conflicts.length });
        results.push({ listingId: listing.id, events: ranges.length, conflicts: conflicts.length, synced: true });
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 490);
        await db.update(listings).set({
          icalLastSyncedAt: new Date(),
          icalSyncStatus: "error",
          icalSyncError: message,
        }).where(eq(listings.id, listing.id));
        logger.warn("[IcalSyncCron] Listing sync failed", { listingId: listing.id, error: message });
        results.push({ listingId: listing.id, synced: false, error: message });
      }
    }

    return res.json({ success: true, processed: listingRows.length, synced, conflicts: totalConflicts, results });
  } catch (error) {
    console.error("[IcalSyncCron] Handler failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), timestamp });
  }
}