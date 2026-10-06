import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_ME_QUERY_OPTIONS } from "@/lib/authMeQueryOptions";

/**
 * Guard test for audit finding C5 (client half).
 *
 * The session probe `auth.me` used to be re-fetched on every component mount
 * (default `staleTime: 0`), and it shared the strict 5/min bucket with login.
 * The fix is a shared option object applied to EVERY `auth.me` observer —
 * one observer with default options would still refetch on mount, because
 * React Query resolves `staleTime` / `refetchOnMount` per observer.
 */

const srcRoot = resolve(import.meta.dirname);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__snapshots__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Every file that calls `auth.me.useQuery`, with the call site text. */
function authMeCallSites(): Array<{ file: string; call: string }> {
  const sites: Array<{ file: string; call: string }> = [];
  for (const file of sourceFiles(srcRoot)) {
    const text = readFileSync(file, "utf8");
    const re = /auth\.me\.useQuery\s*\(([\s\S]{0,400}?)\)\s*[;,]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      sites.push({ file: file.slice(srcRoot.length + 1), call: match[0] });
    }
  }
  return sites;
}

describe("auth.me session caching (C5)", () => {
  it("shares a single cache-first option object", () => {
    expect(AUTH_ME_QUERY_OPTIONS.refetchOnMount).toBe(false);
    expect(AUTH_ME_QUERY_OPTIONS.refetchOnWindowFocus).toBe(false);
    expect(AUTH_ME_QUERY_OPTIONS.retry).toBe(false);
    expect(AUTH_ME_QUERY_OPTIONS.staleTime).toBe(5 * 60_000);
    expect(AUTH_ME_QUERY_OPTIONS.gcTime).toBe(30 * 60_000);
  });

  it("applies AUTH_ME_QUERY_OPTIONS to every auth.me observer", () => {
    const sites = authMeCallSites();
    // Sanity: the scan must actually find the call sites.
    expect(sites.length).toBeGreaterThanOrEqual(3);
    const offenders = sites.filter(s => !s.call.includes("AUTH_ME_QUERY_OPTIONS"));
    expect(offenders.map(o => `${o.file}: ${o.call.trim()}`)).toEqual([]);
  });

  it("keeps AUTH_ME_QUERY_OPTIONS importable from every caller layer", () => {
    for (const { file } of authMeCallSites()) {
      const text = readFileSync(join(srcRoot, file), "utf8");
      expect(text).toContain("AUTH_ME_QUERY_OPTIONS");
      expect(text).toMatch(/import\s*\{[^}]*AUTH_ME_QUERY_OPTIONS[^}]*\}\s*from/);
    }
  });
});
