import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { bookings, listings } from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { escapeIcal, parseIcalEvents, toIcalDate, validateIcalImportUrl } from "../shared/ical";

const FETCH_TIMEOUT_MS = 12_000;

export async function syncListingIcal(listingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: listings.id, icalImportUrl: listings.icalImportUrl }).from(listings).where(eq(listings.id, listingId)).limit(1);
  const listing = rows[0];
  if (!listing?.icalImportUrl) return { synced: false, skipped: "not_configured" as const };
  try {
    const url = validateIcalImportUrl(listing.icalImportUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "text/calendar,text/plain;q=0.9" } });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`iCal HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 1_000_000) throw new Error("iCal feed exceeds 1 MB");
    const body = await response.text();
    if (body.length > 1_000_000) throw new Error("iCal feed exceeds 1 MB");
    const ranges = parseIcalEvents(body);
    await db.update(listings).set({ icalImportedRanges: JSON.stringify(ranges), icalLastSyncedAt: new Date(), icalSyncStatus: "ok", icalSyncError: null }).where(eq(listings.id, listingId));
    return { synced: true, count: ranges.length };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 490);
    await db.update(listings).set({ icalLastSyncedAt: new Date(), icalSyncStatus: "error", icalSyncError: message }).where(eq(listings.id, listingId));
    return { synced: false, error: message };
  }
}

export async function icalSyncHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const configured = await db.select({ id: listings.id }).from(listings).where(eq(listings.icalSyncStatus, "never")).limit(1);
    const rows = await db.select({ id: listings.id }).from(listings).where(eq(listings.icalSyncStatus, "ok")).limit(200);
    const ids = [...configured, ...rows].map(row => row.id);
    const results = [];
    for (const id of ids) results.push(await syncListingIcal(id));
    return res.json({ ok: true, taskUid: user.taskUid, processed: ids.length, results });
  } catch (error) {
    console.error("[IcalSync] Handler failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), timestamp });
  }
}

export async function icalExportHandler(req: Request, res: Response) {
  try {
    const token = String(req.params.token ?? "");
    if (!/^[A-Za-z0-9_-]{32,96}$/.test(token)) return res.status(404).send("Not found");
    const db = await getDb();
    if (!db) return res.status(503).send("Database unavailable");
    const listingRows = await db.select({ id: listings.id, title: listings.title, city: listings.city }).from(listings).where(eq(listings.icalExportToken, token)).limit(1);
    const listing = listingRows[0];
    if (!listing) return res.status(404).send("Not found");
    const rows = await db.select({ id: bookings.id, startDate: bookings.startDate, endDate: bookings.endDate, status: bookings.status }).from(bookings).where(and(eq(bookings.listingId, listing.id), eq(bookings.status, "Confirmed")));
    const now = new Date();
    const events = rows.map(booking => [
      "BEGIN:VEVENT",
      `UID:b2rent-booking-${booking.id}@b2rent.ma`,
      `DTSTAMP:${toIcalDate(now)}`,
      `DTSTART:${toIcalDate(new Date(booking.startDate))}`,
      `DTEND:${toIcalDate(new Date(booking.endDate))}`,
      `SUMMARY:${escapeIcal(`B2-Rent — ${listing.title}`)}`,
      `LOCATION:${escapeIcal(listing.city ?? "Morocco")}`,
      "END:VEVENT",
    ].join("\r\n"));
    const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//B2-Rent Morocco//iCal//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="b2rent-${listing.id}.ics"`);
    return res.send(calendar);
  } catch (error) {
    console.error("[IcalExport] Handler failed:", error);
    return res.status(500).send("Calendar unavailable");
  }
}
