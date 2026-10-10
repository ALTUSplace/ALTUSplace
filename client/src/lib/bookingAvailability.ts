/**
 * Shared availability maths for the car and property detail pages.
 *
 * Booked-date payloads arrive from the API with full timestamps; the UI (and
 * the JSON-LD `availability`) only needs the calendar day. Kept as a pure
 * module so the overlap rules are unit-testable without rendering a page.
 */

export type BlockedRange = { start: string; end: string };

/** Slices `YYYY-MM-DD…` day strings out of API timestamp payloads. */
export function normalizeBlockedRanges(
  ranges: readonly { start: unknown; end: unknown }[],
): BlockedRange[] {
  return ranges.map((range) => ({
    start: String(range.start).slice(0, 10),
    end: String(range.end).slice(0, 10),
  }));
}

/**
 * True when the half-open range `[selectedStart, selectedEnd)` overlaps any
 * blocked range. An empty or inverted selection is never blocked, matching the
 * prior inline behaviour on the property page.
 */
export function isRangeBlocked(
  selectedStart: string,
  selectedEnd: string,
  blockedRanges: readonly BlockedRange[],
): boolean {
  if (!selectedStart || !selectedEnd) return false;
  const start = new Date(`${selectedStart}T00:00:00`).getTime();
  const end = new Date(`${selectedEnd}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return blockedRanges.some((range) => {
    const rangeStart = new Date(`${range.start}T00:00:00`).getTime();
    const rangeEnd = new Date(`${range.end}T00:00:00`).getTime();
    return start < rangeEnd && end > rangeStart;
  });
}
