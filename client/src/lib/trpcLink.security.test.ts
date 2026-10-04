import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as trpcLink from "./trpcLink";

/**
 * The session cookie is HttpOnly. Nothing in the browser is allowed to copy it
 * somewhere script can read it — a previous fallback mirrored `app_session_id`
 * into sessionStorage and replayed it as `Authorization: Bearer …`, which no
 * script in this origin could otherwise reach. Nothing ever wrote that key, so
 * the path was both dead and dangerous.
 *
 * The tests below run under vitest's `node` environment (vitest.config.ts sets
 * `environment: "node"`), so `sessionStorage` and `document` do not exist. That
 * is convenient here: it means any accidental use of either would throw rather
 * than silently pass.
 */
const clientSrc = join(import.meta.dirname, "..");

function everyClientSourceFile(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    // Test files are allowed to name the forbidden identifiers — this file does.
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    if (statSync(full).isDirectory()) found.push(...everyClientSourceFile(full));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/** Comments may discuss the removed mechanism; executable code may not use it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trpcLink — no JS-readable session token", () => {
  it("exports no header helper that could source a token from script", () => {
    expect(Object.keys(trpcLink)).not.toContain("trpcHeaders");
  });

  it("sends the session through the cookie only, never an Authorization header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await trpcLink.trpcFetch("https://example.test/api/trpc/listings.search");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("https://example.test/api/trpc/listings.search");
    // The cookie must still ride along, otherwise every signed-in request 401s.
    expect(init.credentials).toBe("include");

    const headers = new Headers(init.headers as HeadersInit | undefined);
    expect(headers.get("authorization")).toBeNull();
  });

  it("keeps manus-cookie and sessionStorage out of the whole client bundle", () => {
    const offenders = everyClientSourceFile(clientSrc).filter((file) =>
      /manus-cookie|sessionStorage/.test(withoutComments(readFileSync(file, "utf8"))),
    );
    // Structural scan, not behaviour — but it is the only cheap way to stop a
    // future change from re-mirroring the session cookie into script storage.
    expect(offenders).toEqual([]);
  });
});
