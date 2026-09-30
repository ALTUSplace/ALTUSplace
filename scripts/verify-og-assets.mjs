/**
 * Guard: every social-card image referenced by a rendered <head> must exist and
 * must actually be a usable card.
 *
 * Three real defects motivated this, none of which the type checker or the
 * prerender notice, because all of them leave valid HTML behind:
 *
 *   1. Missing asset. A meta tag can point at a file that is not in the tree —
 *      og:image was repointed at images/og-default.png while the PNG existed
 *      only in a gitignored dist/ copy, so every preview 404'd. `tsc` and the
 *      prerender both passed.
 *   2. Stale declared size. og:image:width/height are hand-maintained strings.
 *      After swapping the image they silently describe the old file, and some
 *      scrapers lay the card out from them.
 *   3. Padded canvas. client/public/images/logo.png is 1000x558 but 94.7% of
 *      that canvas is transparent padding around a small portrait lockup. It is
 *      a perfectly valid PNG, so nothing flags it, yet as a social card it
 *      previews as a near-empty box.
 *
 * Runs against the static head plus any prerendered routes, and resolves each
 * URL through the directory that serves it: Vite copies client/public/ verbatim
 * to the site root, so /images/x.png lives at client/public/images/x.png.
 *
 * Usage: node scripts/verify-og-assets.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const TAG = "[verify-og-assets]";

// Facebook and Twitter reject cards over 5 MB.
const MAX_BYTES = 5 * 1024 * 1024;
// Social cards are downloaded by crawler and messaging clients on mobile
// connections. The committed card is ~88 kB; this ceiling stops a regeneration
// (or a swap to a new asset) from silently shipping a heavier one.
const MAX_SOCIAL_BYTES = 100 * 1024;
// A card that is mostly transparent padding previews as an empty box.
const MAX_PADDING_RATIO = 0.35;

/** Every index.html to audit, paired with the directory that serves its URLs. */
function collectSources() {
  const sources = [];
  const push = (html, base) => {
    if (existsSync(html)) sources.push({ html, base });
  };

  // The static fallback head. Vite's publicDir is copied to the site root.
  push(resolve(root, "client", "index.html"), resolve(root, "client", "public"));

  // Prerendered routes, when a build has produced them. Same layout.
  const distRoot = resolve(root, "dist", "public");
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name === "index.html") push(full, distRoot);
      else if (entry.isDirectory()) walk(full);
    }
  };
  if (existsSync(distRoot)) walk(distRoot);

  return sources;
}

function metaContent(html, attribute, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<meta\\s+${attribute}="${escaped}"\\s+content="([^"]*)"`, "i");
  return html.match(re)?.[1] ?? null;
}

/** Map a site-absolute URL onto a file under `base`, or null if not local. */
function resolveLocal(url, base) {
  const path = url.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  if (!path.startsWith("/")) return null;
  return join(base, path.replace(/^\/+/, ""));
}

/**
 * Decode each asset once. Returns existence, byte size, true canvas size and
 * how much of that canvas is transparent padding.
 */
const inspected = new Map();
async function inspect(file) {
  if (inspected.has(file)) return inspected.get(file);

  const result = (async () => {
    const verdict = { problems: [], width: null, height: null, label: relative(root, file) };

    if (!existsSync(file)) {
      verdict.problems.push(`file does not exist at ${verdict.label}`);
      return verdict;
    }

    const bytes = statSync(file).size;
    if (bytes > MAX_BYTES) {
      verdict.problems.push(
        `${(bytes / 1024 / 1024).toFixed(1)} MB exceeds the 5 MB social-card limit`,
      );
    }
    if (bytes > MAX_SOCIAL_BYTES) {
      verdict.problems.push(
        `${(bytes / 1024).toFixed(1)} kB exceeds the ${MAX_SOCIAL_BYTES / 1024} kB social-card budget ` +
          `(use scripts/generate-og-image.mjs)`,
      );
    }

    const meta = await sharp(file).metadata();
    verdict.width = meta.width;
    verdict.height = meta.height;

    // trim() collapses the transparent border, so the difference between the
    // canvas and the trimmed box is exactly the padding a scraper would show.
    let contentW = meta.width;
    let contentH = meta.height;
    try {
      const trimmed = await sharp(file).trim({ threshold: 1 }).png().toBuffer();
      const tm = await sharp(trimmed).metadata();
      if (tm.width && tm.height) {
        contentW = tm.width;
        contentH = tm.height;
      }
    } catch {
      // A fully transparent or untrimmable image is a problem in its own right.
      verdict.problems.push("could not be trimmed (image may be fully transparent)");
      return verdict;
    }

    if (meta.width && meta.height) {
      const padding = 1 - (contentW * contentH) / (meta.width * meta.height);
      if (padding > MAX_PADDING_RATIO) {
        verdict.problems.push(
          `${(padding * 100).toFixed(0)}% of the ${meta.width}x${meta.height} canvas is transparent ` +
            `padding around a ${contentW}x${contentH} mark — it will preview as a near-empty box ` +
            `(use scripts/generate-og-image.mjs)`,
        );
      }
    }

    return verdict;
  })();

  inspected.set(file, result);
  return result;
}

const failures = [];
const warnings = [];
const audited = new Set();

for (const { html: htmlPath, base } of collectSources()) {
  const where = relative(root, htmlPath);
  const html = readFileSync(htmlPath, "utf8");

  for (const [attribute, name] of [
    ["property", "og:image"],
    ["name", "twitter:image"],
  ]) {
    const url = metaContent(html, attribute, name);
    if (!url) {
      failures.push(`${where}: missing <meta ${attribute}="${name}">`);
      continue;
    }

    const file = resolveLocal(url, base);
    if (!file) {
      warnings.push(`${where}: ${name} is not site-absolute (${url}) — skipped`);
      continue;
    }

    audited.add(relative(root, file));
    const verdict = await inspect(file);
    for (const problem of verdict.problems) {
      failures.push(`${where}: ${name} -> ${url}: ${problem}`);
    }
  }

  // Declared dimensions must describe the real file, not the one it replaced.
  const declaredW = metaContent(html, "property", "og:image:width");
  const declaredH = metaContent(html, "property", "og:image:height");
  const ogUrl = metaContent(html, "property", "og:image");

  if (declaredW || declaredH) {
    if (!ogUrl) {
      failures.push(`${where}: declares og:image:width/height but no og:image`);
    } else {
      const file = resolveLocal(ogUrl, base);
      const verdict = file ? await inspect(file) : null;
      if (verdict?.width) {
        if (declaredW && Number(declaredW) !== verdict.width) {
          failures.push(
            `${where}: og:image:width="${declaredW}" but the file is ${verdict.width}px wide`,
          );
        }
        if (declaredH && Number(declaredH) !== verdict.height) {
          failures.push(
            `${where}: og:image:height="${declaredH}" but the file is ${verdict.height}px tall`,
          );
        }
      }
    }
  }
}

for (const w of [...new Set(warnings)]) console.warn(`${TAG} WARN ${w}`);

if (failures.length) {
  for (const f of [...new Set(failures)]) console.error(`${TAG} FAIL ${f}`);
  console.error(`\n${TAG} ${new Set(failures).size} problem(s) found.`);
  process.exit(1);
}

console.log(
  `${TAG} OK — ${audited.size} social image(s) resolve, match their declared size, and are not padded canvases.`,
);
