/**
 * Minimal static server for the built client (dist/public).
 *
 * The dev server cannot be used to validate layout: its CSP blocks Vite's
 * React-Fast-Refresh preamble inline script, so the SPA never mounts and #root
 * stays empty. The production build ships a sha256-allowlisted inline theme
 * script, so the built shell is the only faithful thing to measure.
 *
 * Usage: node scripts/serve-dist.mjs [port]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, normalize } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "dist", "public");
const PORT = Number(process.argv[2] ?? 4173);

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

async function resolveFile(urlPath) {
  // Strip the query/hash, decode, and refuse anything that escapes ROOT.
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
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
    // SPA fallback for extensionless marketing routes (/search, /blog, ...).
    if (!extname(clean)) {
      const fallback = join(ROOT, "index.html");
      try {
        await stat(fallback);
        return fallback;
      } catch {
        return null;
      }
    }
    return null;
  }
}

createServer(async (req, res) => {
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
}).listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}/`);
});
