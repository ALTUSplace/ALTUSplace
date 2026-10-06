import { platformSettings } from "../drizzle/schema";

/**
 * Allowlist of `platform_settings` columns that may leave the server.
 *
 * Audit finding C1: `admin.commissionSettings` ran `SELECT *`, so every admin
 * session received the owner fallback-login credentials
 * (`ownerPasswordHash` / `ownerPasswordSalt`) and the DB-backed session
 * signing key (`sessionSecret`). Both are live secrets: the hash+salt verify
 * the real owner password, and `sessionSecret` signs cookies whenever no
 * JWT_SECRET is configured.
 *
 * Audit finding C2: `platform.settings.updated` stored that same raw row in
 * `audit_logs.before_data`, persisting the credentials in 9 of 52 audit rows.
 * `sanitizePlatformSettingsSnapshot` is the single gate both paths go through,
 * so a raw row can never reach an API response or the audit trail.
 */
export const PLATFORM_SETTINGS_PUBLIC_COLUMNS = {
  id: platformSettings.id,
  commissionRateBasisPoints: platformSettings.commissionRateBasisPoints,
  commissionMode: platformSettings.commissionMode,
  flatCommissionAmount: platformSettings.flatCommissionAmount,
  vatRateBasisPoints: platformSettings.vatRateBasisPoints,
  platformName: platformSettings.platformName,
  contactEmail: platformSettings.contactEmail,
  contactPhone: platformSettings.contactPhone,
  maintenanceMode: platformSettings.maintenanceMode,
} as const;

/** Column keys of {@link PLATFORM_SETTINGS_PUBLIC_COLUMNS} (runtime view). */
export const PLATFORM_SETTINGS_PUBLIC_KEYS: readonly string[] = Object.keys(
  PLATFORM_SETTINGS_PUBLIC_COLUMNS,
);

/**
 * Columns that must NEVER appear in an API response or in
 * `audit_logs.before_data` / `after_data` for `platform.settings.updated`.
 * Guard test: `server/platform-settings.secrets.test.ts`.
 */
export const PLATFORM_SETTINGS_SECRET_KEYS = [
  "ownerPasswordHash",
  "ownerPasswordSalt",
  "sessionSecret",
] as const;

/**
 * Row shape returned by `admin.commissionSettings`. Deliberately narrower than
 * the table: no credential columns, no `updatedBy` audit metadata.
 */
export type PlatformSettingsSnapshot = {
  id: number;
  commissionRateBasisPoints: number;
  commissionMode: string;
  flatCommissionAmount: number;
  vatRateBasisPoints: number;
  platformName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  maintenanceMode: boolean;
};

/** Shape returned when no DB is available, so the output union stays stable. */
export function defaultPlatformSettings(): PlatformSettingsSnapshot {
  return {
    id: 0,
    commissionRateBasisPoints: 1000,
    commissionMode: "percent",
    flatCommissionAmount: 0,
    vatRateBasisPoints: 2000,
    platformName: "ALTUSplace",
    contactEmail: "",
    contactPhone: null,
    maintenanceMode: false,
  };
}

/**
 * Picks ONLY {@link PLATFORM_SETTINGS_PUBLIC_KEYS} out of a raw `SELECT *`
 * row. Returns `null` for a missing row so the caller keeps its fallback.
 *
 * This is deliberately an allowlist projection rather than a denylist strip:
 * a future credential column added to `platform_settings` then cannot leak
 * until it is explicitly added to `PLATFORM_SETTINGS_PUBLIC_COLUMNS`.
 */
export function sanitizePlatformSettingsSnapshot(
  row: Record<string, unknown> | null | undefined,
): PlatformSettingsSnapshot | null {
  if (!row) return null;
  const fallback = defaultPlatformSettings();
  const out: Record<string, unknown> = {};
  for (const key of PLATFORM_SETTINGS_PUBLIC_KEYS) {
    const value = row[key];
    out[key] = value === undefined ? (fallback as Record<string, unknown>)[key] : value;
  }
  return out as unknown as PlatformSettingsSnapshot;
}
