/**
 * The moderation reason attached to an audit-log entry.
 *
 * Current rows carry it in the dedicated `notes` column. Rows written before
 * that column was populated have it only inside the `afterData` JSON, so both
 * are consulted — reading `notes` alone would blank out every historical
 * rejection reason on deploy.
 */
export function auditNote(entry: {
  notes?: string | null;
  afterData?: string | null;
}): string | null {
  const direct = entry.notes?.trim();
  if (direct) return direct;

  if (!entry.afterData) return null;

  try {
    const legacy = (JSON.parse(entry.afterData) as { reason?: unknown }).reason;
    return typeof legacy === "string" && legacy.trim() ? legacy.trim() : null;
  } catch {
    // A malformed payload is not a reason to throw while rendering a feed.
    return null;
  }
}