/**
 * Pure helpers for the moderation queue page.
 *
 * Deliberately free of React and of any trpc types: everything here is a total
 * function over plain data, so it can be tested in vitest's node environment.
 * The repo ships no DOM and no React-testing library, which means a component
 * test is not available -- anything that can be a pure function is one, so that
 * the untestable surface stays as small as possible.
 *
 * The item shapes mirror `admin.moderationQueue` in server/routers.ts. They are
 * declared here rather than inferred from the router so the page compiles even
 * if the endpoint changes shape, and so the fallback branches below are
 * reachable in a test by handing them data that did not come from our own
 * server.
 */

export const QUEUE_KINDS = ["listing", "kyc", "partner", "refund"] as const;

export type QueueKind = (typeof QUEUE_KINDS)[number];

export type QueueCounts = Record<QueueKind, number>;

export type ListingQueueItem = {
  kind: "listing";
  id: number;
  title: string;
  category: string;
  city: string;
  ownerId: number;
  ownerName: string | null;
  pricePerDay: number;
  imageUrl: string | null;
  submittedAt: Date;
};

export type KycQueueItem = {
  kind: "kyc";
  id: number;
  userId: number;
  userName: string | null;
  documentType: string;
  applicantRole: string;
  documentKey: string;
  originalFileName: string;
  documentNumberMasked: string | null;
  submittedAt: Date;
};

export type PartnerQueueItem = {
  kind: "partner";
  id: number;
  agencyName: string;
  city: string;
  contactPerson: string | null;
  email: string;
  phone: string;
  type: string;
  description: string | null;
  logoUrl: string | null;
  galleryUrls: string[] | null;
  submittedAt: Date;
};

export type RefundQueueItem = {
  kind: "refund";
  id: number;
  bookingId: number;
  requesterName: string | null;
  amount: number;
  reason: string;
  submittedAt: Date;
};

export type QueueItem = ListingQueueItem | KycQueueItem | PartnerQueueItem | RefundQueueItem;

/**
 * Structural shape the title/meta helpers accept.
 *
 * Deliberately all-optional and `unknown`-typed: these helpers read values that
 * arrived over the wire, so every field can legitimately be absent or the wrong
 * type, and the fallbacks below are only reachable if the signature permits
 * that. A `QueueItem` is assignable to this without a cast.
 */
export type QueueItemLike = {
  kind: string;
  id?: unknown;
  submittedAt?: unknown;
  title?: unknown;
  userName?: unknown;
  agencyName?: unknown;
  bookingId?: unknown;
  category?: unknown;
  city?: unknown;
  ownerId?: unknown;
  ownerName?: unknown;
  pricePerDay?: unknown;
  documentType?: unknown;
  applicantRole?: unknown;
  documentNumberMasked?: unknown;
  contactPerson?: unknown;
  email?: unknown;
  amount?: unknown;
  reason?: unknown;
};

const KIND_LABEL: Record<QueueKind, string> = {
  listing: "إعلانات",
  kyc: "تحقق الهوية",
  partner: "طلبات الشراكة",
  refund: "طلبات الاسترداد",
};

const KIND_BADGE: Record<QueueKind, string> = {
  listing: "إعلان",
  kyc: "تحقق",
  partner: "شراكة",
  refund: "استرداد",
};

/**
 * Arabic label for a queue section. An unrecognised kind degrades to a generic
 * label instead of throwing, because this value arrives over the wire and an
 * older client can meet a kind a newer server added.
 */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as QueueKind] ?? "أخرى";
}

/** Short badge text, used where the full label would not fit. */
export function kindBadge(kind: string): string {
  return KIND_BADGE[kind as QueueKind] ?? "أخرى";
}

/** Directory listing for which actions the queue page offers. */
export function isActionable(kind: string): boolean {
  return kind === "listing" || kind === "kyc" || kind === "partner";
}

/**
 * Formats a dirham amount. Uses a fixed grouping separator rather than
 * `toLocaleString`, whose output depends on the host ICU build -- a queue row
 * should not render differently on a server that happens to be built with
 * small-icu.
 */
export function formatMad(value: number): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString("en-US")} د.م.`;
}

/**
 * Renders a display name, falling back to a stable id label when the joined
 * `users.name` is null (deleted user) or blank.
 *
 * Takes `unknown` rather than `string | null` because the value crosses the
 * network: a server that projected a number or omitted the key entirely would
 * otherwise render "null" into the page.
 */
function nameOrId(value: unknown, id: unknown, prefix: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : `${prefix} #${String(id ?? "?")}`;
}

/** Renders a text field, omitting it entirely when absent or blank. */
function textPart(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * The primary line for a queue row. Never empty and never throws: an item with
 * no recognisable kind renders as a neutral placeholder rather than blanking
 * the row, so a server/client shape mismatch is visible instead of silent.
 */
export function queueItemTitle(item: QueueItemLike): string {
  switch (item.kind) {
    case "listing":
      return textPart(item.title) ?? `إعلان #${String(item.id ?? "?")}`;
    case "kyc":
      return `طلب تحقق — ${nameOrId(item.userName, item.id, "مستخدم")}`;
    case "partner":
      return textPart(item.agencyName) ?? `طلب شراكة #${String(item.id ?? "?")}`;
    case "refund":
      return `طلب استرداد — حجز #${String(item.bookingId ?? "?")}`;
    default:
      return "عنصر غير معروف";
  }
}

/**
 * Secondary line: the context an admin needs to decide, per kind.
 *
 * Always returns at least one segment. A row whose every field is missing must
 * still say so, rather than rendering an empty line that looks like a bug in
 * the layout.
 */
export function queueItemMeta(item: QueueItemLike): string {
  const parts: string[] = [];
  switch (item.kind) {
    case "listing":
      for (const value of [item.category, item.city]) {
        const part = textPart(value);
        if (part) parts.push(part);
      }
      parts.push(nameOrId(item.ownerName, item.ownerId, "مالك"));
      if (typeof item.pricePerDay === "number" && Number.isFinite(item.pricePerDay)) {
        parts.push(formatMad(item.pricePerDay));
      }
      break;
    case "kyc":
      for (const value of [item.documentType, item.applicantRole, item.documentNumberMasked]) {
        const part = textPart(value);
        if (part) parts.push(part);
      }
      break;
    case "partner":
      for (const value of [item.city, item.contactPerson, item.email]) {
        const part = textPart(value);
        if (part) parts.push(part);
      }
      break;
    case "refund":
      if (typeof item.amount === "number" && Number.isFinite(item.amount)) parts.push(formatMad(item.amount));
      for (const value of [item.reason]) {
        const part = textPart(value);
        if (part) parts.push(part);
      }
      break;
    default:
      parts.push("لا تتوفر تفاصيل");
  }
  // A row whose every field was null still has to say something: an empty
  // second line is indistinguishable from a rendering bug, and the admin has no
  // way to tell "no data" from "the page failed".
  if (parts.length === 0) parts.push("لا تتوفر تفاصيل");
  return parts.join(" • ");
}

/**
 * Count for one queue section.
 *
 * Returns 0 for an absent or malformed key rather than undefined. A badge
 * rendering `undefined` reads as "unknown", which is a different claim from
 * "there is nothing here" -- and the second one is what the server actually
 * means.
 */
export function countFor(counts: Partial<Record<QueueKind, number>> | null | undefined, kind: QueueKind): number {
  const value = counts?.[kind];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Total pending across every section, for the page header. */
export function totalPending(counts: Partial<Record<QueueKind, number>> | null | undefined): number {
  return QUEUE_KINDS.reduce((sum, kind) => sum + countFor(counts, kind), 0);
}

/**
 * Oldest-first ordering, the inverse of every other list in the admin tier.
 *
 * A moderation queue sorted newest-first starves old submissions indefinitely: a
 * steady arrival rate means the oldest item never reaches the top of the page.
 *
 * Two robustness properties, both because `submittedAt` crosses the wire:
 * an unparseable value sorts LAST rather than first (an invalid date must not
 * jump the queue by reading as epoch 0), and ties break on `id` so the order is
 * total and reproducible rather than dependent on engine sort stability.
 */
export function compareByOldestFirst(
  a: { submittedAt: Date | string | number | null | undefined; id?: unknown },
  b: { submittedAt: Date | string | number | null | undefined; id?: unknown },
): number {
  const time = (value: Date | string | number | null | undefined) => {
    // null and undefined must be rejected before parsing: `new Date(null)` is
    // epoch 0, so a naive coercion would rank a row with no timestamp as the
    // OLDEST in the queue and float it to the very top.
    if (value === null || value === undefined || value === "") return Number.MAX_SAFE_INTEGER;
    const parsed = new Date(value as string).getTime();
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };
  const left = time(a.submittedAt);
  const right = time(b.submittedAt);
  if (left !== right) return left - right;
  const aId = Number(a.id);
  const bId = Number(b.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
  return 0;
}

/**
 * Formats a submission timestamp for display.
 *
 * Takes `unknown` and falls back to an em dash rather than letting `Invalid
 * Date` or `undefined` reach the screen: a visibly missing date is honest about
 * the row, whereas a rendered "Invalid Date" looks like a formatting bug.
 */
export function formatSubmitted(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-MA");
}