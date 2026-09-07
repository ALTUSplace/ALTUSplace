export interface DateRange {
  start: Date;
  end: Date;
}

export interface SerializedDateRange {
  start: string;
  end: string;
}

export function parseDateRange(startValue: string, endValue: string): DateRange | null {
  const start = new Date(startValue);
  const end = new Date(endValue);
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end ? null : { start, end };
}

export function overlaps(left: DateRange, right: DateRange): boolean {
  return left.start < right.end && left.end > right.start;
}

export function parseBlockedRanges(value: string | null | undefined): DateRange[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((range: unknown) => {
      if (!range || typeof range !== "object" || !("start" in range) || !("end" in range)) return [];
      const start = new Date(String(range.start));
      const end = new Date(String(range.end));
      return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end ? [] : [{ start, end }];
    });
  } catch {
    return [];
  }
}

export function isRangeAvailable(request: DateRange, blockedRanges: DateRange[]): boolean {
  return blockedRanges.every((blocked) => !overlaps(request, blocked));
}