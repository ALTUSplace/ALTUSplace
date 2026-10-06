import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * H2 browser regression test (mobile horizontal overflow at 375px).
 *
 * Serves the BUILT client (dist/public) over a local static server — the dev
 * server cannot be used because its CSP blocks Vite's React-Fast-Refresh
 * preamble, so the SPA never mounts (see scripts/serve-dist.mjs). The
 * production shell is the only faithful thing to measure.
 *
 * Asserts, at 375px, that the document has no horizontal overflow on the pages
 * the audit flagged (/, /search?type=car, /property/1) while the seasonal
 * pill-rail remains genuinely scrollable (contain-paint must NOT have disabled
 * its scrolling).
 *
 * Skips when the build output is missing (fresh checkout) or when Playwright
 * chromium is unavailable.
 */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const ROOT = resolve(process.cwd(), "dist", "public");
const indexPath = join(ROOT, "index.html");

async function resolveFile(urlPath) {
  const clean = new URL(urlPath, "http://localhost").pathname.replace(/^\//, "") || "/";
  const candidate = resolve(join(ROOT, normalize(clean)));
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = join(candidate, "index.html");
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    // SPA fallback for extensionless routes (/search, /property/1, ...).
    if (!extname(clean)) {
      try {
        await stat(indexPath);
        return indexPath;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Playwright availability is resolved at module load so `it.skipIf` can see it
// during collection (beforeAll runs too late for that).
const { chromium = undefined } = await import("playwright").catch(() => ({}));
let browser;
let server;
let port;

beforeAll(async () => {
  if (!chromium) return;

  server = createServer(async (req, res) => {
    const file = await resolveFile(req.url ?? "/");
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("read error");
    }
  });
  await new Promise((resolveListen) => server.listen(0, resolveListen));
  port = server.address().port;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolveClose) => server?.close(resolveClose));
});

const hasBuild = existsSync(indexPath);

describe("mobile horizontal overflow at 375px (H2)", () => {
  it.skipIf(!hasBuild || !chromium)(
    "documents have no horizontal page overflow while the pill rail stays scrollable",
    async () => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 720 },
        deviceScaleFactor: 1,
      });
      // API aborts so nothing fights the local static server / rate limits.
      await ctx.route("**/api/**", (r) => r.abort());
      const page = await ctx.newPage();

      try {
        for (const path of ["/", "/search?type=car", "/property/1"]) {
          await page.goto(`http://127.0.0.1:${port}${path}`, {
            waitUntil: "domcontentloaded",
          });
          // Wait for the SPA to mount and the header pill rail to appear.
          await page.waitForSelector("ul.overflow-x-auto", { timeout: 15_000 });
          // Allow client-side effects (carousels/filters) to settle.
          await page.waitForTimeout(600);

          const m = await page.evaluate(() => {
            const rail = Array.from(document.querySelectorAll("ul")).find(
              (u) => getComputedStyle(u).overflowX === "auto",
            );
            return {
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth,
              railScroll: rail ? rail.scrollWidth : null,
              railClient: rail ? rail.clientWidth : null,
              railContain: rail ? getComputedStyle(rail).contain : null,
            };
          });

          // The audit's failure mode: scrollWidth was 587 (a +212px bleed) at a
          // 375px viewport. Allow 1px of rounding slop.
          expect(
            m.scrollWidth - m.innerWidth,
            `${path}: document scrollWidth must not exceed the viewport`,
          ).toBeLessThanOrEqual(1);

          // Containment must not have disabled the rail's horizontal scrolling.
          expect(m.railScroll).toBeGreaterThan(0);
          expect(m.railClient).toBeGreaterThan(0);
          expect(m.railScroll).toBeGreaterThanOrEqual(m.railClient);
          expect(m.railContain).toContain("paint");
        }
      } finally {
        await page.close();
        await ctx.close();
      }
    },
    60_000,
  );
});