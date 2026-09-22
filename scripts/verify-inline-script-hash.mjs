/**
 * Post-build guard: the CSP allowlist must contain the browser-accurate sha256
 * of the inline anti-FOUC theme script shipped in dist/public/index.html.
 *
 * Browsers hash inline scripts over newline-normalized text (CR/CRLF -> LF),
 * so a hash computed over raw CRLF bytes never matches. Drift between the
 * built artifact and the policy is caught here so `pnpm build` itself fails
 * (and nothing drifts into a deploy).
 *
 * Run automatically at the end of the `build` script.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const indexPath = resolve(root, "dist", "public", "index.html");
const vercelPath = resolve(root, "vercel.json");

if (!existsSync(indexPath)) {
  console.error(
    `[verify-inline-script-hash] dist/public/index.html not found at ${indexPath}`
  );
  process.exit(1);
}

// Expected hash: the sha256 entries listed in the edge Content-Security-Policy
// (kept byte-identical to CSP_HEADER_VALUE by server/cspParity.test.ts).
const config = JSON.parse(readFileSync(vercelPath, "utf8"));
const edgeCsp = config.headers
  ?.find((entry) => entry.source === "/(.*)")
  ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;

if (!edgeCsp) {
  console.error("[verify-inline-script-hash] Could not read CSP from vercel.json");
  process.exit(1);
}

const allowedHashes = [
  ...(edgeCsp.match(/script-src ([^;]+)/)?.[1].matchAll(/sha256-([A-Za-z0-9+/=]+)/g) ?? []),
].map((m) => m[1]);

// Inline theme script: the only <script> with no `type`/`src` attribute.
const html = readFileSync(indexPath, "utf8");
const inlineScripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .map((match) => ({ attrs: match[1], body: match[2] }))
  .filter(({ attrs }) => !/\b(?:src|type)\s*=/.test(attrs));

if (inlineScripts.length !== 1) {
  console.error(
    `[verify-inline-script-hash] Expected exactly one untagged inline <script> in dist/public/index.html, found ${inlineScripts.length}`
  );
  process.exit(1);
}

const browserAccurateHash = createHash("sha256")
  .update(inlineScripts[0].body.replace(/\r\n?/g, "\n"), "utf8")
  .digest("base64");

if (!allowedHashes.includes(browserAccurateHash)) {
  console.error(
    `[verify-inline-script-hash] CSP drift detected: built inline theme script hashes to ` +
      `sha256-${browserAccurateHash}, but the Content-Security-Policy in vercel.json only ` +
      `allowlists [${allowedHashes.join(", ")}]. Update shared/security/csp.ts and ` +
      `vercel.json to the new browser-accurate hash.`
  );
  process.exit(1);
}

console.log(`[verify-inline-script-hash] OK — inline theme script sha256-${browserAccurateHash} is allowlisted in the CSP.`);