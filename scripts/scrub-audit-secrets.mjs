#!/usr/bin/env node
/**
 * One-time cleanup for audit finding C2.
 *
 * `platform.settings.updated` used to write the raw `platform_settings` row
 * into `audit_logs.before_data`, so 9 of the 52 audit rows contain the owner
 * fallback-login credentials (`ownerPasswordHash` / `ownerPasswordSalt`) and
 * the DB-backed session signing key (`sessionSecret`).
 *
 * The write path is fixed by `sanitizePlatformSettingsSnapshot`
 * (server/platformSettingsPolicy.ts); this script scrubs the rows that were
 * written before the fix. It is intentionally NOT part of the build or the
 * migration chain — run it manually after the fix is deployed:
 *
 *   node scripts/scrub-audit-secrets.mjs            # dry run, prints a report
 *   node scripts/scrub-audit-secrets.mjs --apply    # rewrite the rows
 *
 * The script never prints a secret value: only the row id and which key was
 * found. The redacted value is the literal string "[redacted]" so the audit
 * feed still shows that something was removed rather than silently losing the
 * field.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

/** Keys that must never survive in `audit_logs.before_data` / `after_data`. */
export const FORBIDDEN_KEYS = [
  "ownerPasswordHash",
  "ownerPasswordSalt",
  "sessionSecret",
  // snake_case spellings, in case a row was serialised from column names
  // rather than ORM property names.
  "owner_password_hash",
  "owner_password_salt",
  "session_secret",
];

const REDACTED = "[redacted]";

function walk(value, hits) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, hits);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key) && value[key] !== REDACTED) {
      hits.add(key);
      value[key] = REDACTED;
    } else {
      walk(value[key], hits);
    }
  }
}

/**
 * Pure: returns `{ text, changed, keys }` for one `before_data` /
 * `after_data` payload. Non-JSON payloads are returned untouched.
 *
 * `keys` is the set of forbidden key names that were present (names only —
 * never the values), so a caller can report what was scrubbed safely.
 */
export function scrubAuditPayload(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { text: raw ?? null, changed: false, keys: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { text: raw, changed: false, keys: [] };
  }
  const hits = new Set();
  walk(parsed, hits);
  if (hits.size === 0) return { text: raw, changed: false, keys: [] };
  return { text: JSON.stringify(parsed), changed: true, keys: [...hits] };
}

function loadEnv() {
  // Honour an already-exported DATABASE_URL first, then the usual local files.
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) return;
  for (const file of [".env", ".env.production.local", ".env.local"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const key of ["DATABASE_URL", "SUPABASE_DB_URL"]) {
      const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (match) {
        const value = match[1].trim().replace(/^["']|["']$/g, "");
        if (value) {
          process.env[key] = value;
          return;
        }
      }
    }
  }
}

export async function run({ apply = false, sql } = {}) {
  loadEnv();
  const client =
    sql ??
    postgres(process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL, { max: 1, onnotice: () => {} });

  const patterns = FORBIDDEN_KEYS.map((key) => `%${key}%`);
  const rows = await client`
    SELECT id, action, before_data, after_data
    FROM audit_logs
    WHERE before_data LIKE ANY(${patterns})
       OR after_data  LIKE ANY(${patterns})
    ORDER BY id
  `;

  const report = [];
  let scrubbed = 0;
  for (const row of rows) {
    const before = scrubAuditPayload(row.before_data);
    const after = scrubAuditPayload(row.after_data);
    if (!before.changed && !after.changed) continue;
    const keys = [...new Set([...before.keys, ...after.keys])];
    report.push({ id: row.id, action: row.action, keys });
    scrubbed += 1;
    if (apply) {
      if (before.changed) await client`UPDATE audit_logs SET before_data = ${before.text} WHERE id = ${row.id}`;
      if (after.changed) await client`UPDATE audit_logs SET after_data = ${after.text} WHERE id = ${row.id}`;
    }
  }

  if (!sql) await client.end({ timeout: 0 });
  return { total: rows.length, scrubbed, report, applied: apply };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const apply = process.argv.includes("--apply");
  const result = await run({ apply });
  console.log(
    `[scrub-audit-secrets] scanned=${result.total} ${apply ? "scrubbed" : "would-scrub"}=${result.scrubbed}`,
  );
  for (const entry of result.report) {
    console.log(`  #${entry.id} ${entry.action} -> redacted: ${entry.keys.join(", ")}`);
  }
  if (!apply && result.scrubbed > 0) {
    console.log("[scrub-audit-secrets] dry run only. Re-run with --apply to rewrite the rows.");
  }
  if (result.scrubbed === 0) {
    console.log("[scrub-audit-secrets] nothing to do — audit_logs is clean.");
  }
}
