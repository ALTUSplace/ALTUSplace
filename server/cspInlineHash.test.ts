import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP_HEADER_VALUE } from "../shared/security/csp";

/**
 * CSP inline-script hash regression guard.
 *
 * Browsers hash an inline <script> over its newline-normalized source text:
 * the HTML parser collapses CR / CRLF sequences to LF before the script text
 * reaches the scanner, and the CSP digest is computed over that normalized
 * text. A hash computed over raw CRLF bytes (e.g. from a Windows checkout with
 * core.autocrlf) therefore never matches what the browser computes and the
 * inline anti-FOUC theme script is silently blocked (CSP violation + theme
 * flash).
 *
 * This test reads the BUILT index.html (the exact artifact that ships), hashes
 * the inline theme script exactly like a browser, and asserts that digest is
 * the one allowlisted in CSP_HEADER_VALUE — so any drift between the build
 * output and the policy fails the suite after a `pnpm build`.
 */
describe("CSP inline script hash (dist/public/index.html <-> CSP_HEADER_VALUE)", () => {
  it("allowlists the browser-accurate sha256 of the inline anti-FOUC theme script", () => {
    const indexPath = resolve(process.cwd(), "dist", "public", "index.html");

    // Fresh checkouts have no build output yet. The test enforces the invariant
    // the moment `pnpm build` has run; tell the developer to build first rather
    // than failing on a missing (stale-less) artifact.
    if (!existsSync(indexPath)) {
      console.warn(
        "Skipping CSP inline-hash check: dist/public/index.html not found — run `pnpm build` first."
      );
      return;
    }

    const html = readFileSync(indexPath, "utf8");

    // The theme script is the only inline <script> with no `type`/`src`
    // attribute (the SEO JSON-LD node uses type="application/ld+json" and the
    // entry bundle is <script type="module" src=...>). Exactly one must exist.
    const inlineScripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
      .map((match) => ({ attrs: match[1], body: match[2] }))
      .filter(({ attrs }) => !/\b(?:src|type)\s*=/.test(attrs));

    expect(inlineScripts).toHaveLength(1);

    // Browser-accurate digest: normalize CR/CRLF -> LF before hashing.
    const browserAccurateHash = createHash("sha256")
      .update(inlineScripts[0].body.replace(/\r\n?/g, "\n"), "utf8")
      .digest("base64");

    // The allowlisted hash inside the script-src directive must equal it.
    const allowedHashes = [
      ...(CSP_HEADER_VALUE.match(/script-src ([^;]+)/)?.[1].matchAll(/sha256-([A-Za-z0-9+/=]+)/g) ?? []),
    ].map((m) => m[1]);

    expect(allowedHashes).toContain(browserAccurateHash);
  });
});