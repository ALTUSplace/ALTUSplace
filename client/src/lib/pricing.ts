/**
 * Shared booking price helpers used by CarDetails, Checkout and property
 * detail pages. The server remains the authoritative price calculator —
 * these helpers keep the client preview aligned with its semantics
 * (midday-anchored dates, ceil duration, guarded subtotal).
 */

/** Daily insurance fee applied when the renter opts into full coverage. */
export const INSURANCE_FEE_PER_DAY = 100;

/** Daily baby-seat fee applied when the renter opts into the add-on. */
export const BABY_SEAT_FEE_PER_DAY = 50;

/**
 * Parses a `YYYY-MM-DD` (or full ISO) date string anchored to midday so
 * daylight-saving transitions cannot shift the day count. Returns null for
 * empty or unparseable values.
 */
export function parseDayDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Rental duration in days between two date strings (ceil, end exclusive).
 * Returns 0 when either date is missing/invalid or when the range is not
 * strictly forward — callers apply their own display fallback on top.
 */
export function calculateRentalDays(startDate: string, endDate: string): number {
  const start = parseDayDate(startDate);
  const end = parseDayDate(endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Price subtotal for a rental. Returns 0 when the rate or duration is not a
 * positive finite number, mirroring the checkout guard against NaN leakage.
 */
export function calculateRentalSubtotal(pricePerDay: number, days: number): number {
  if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) return 0;
  if (!Number.isInteger(days) || days <= 0) return 0;
  return pricePerDay * days;
}
