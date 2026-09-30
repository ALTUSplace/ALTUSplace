/**
 * DIAGNOSTIC ONLY - interactive one-off, not a gate.
 * Requires a browser and a running dev server, and its output is for a human
 * to read. Not wired into any npm script or CI workflow, and not covered by
 * tests. Do not add it to a pipeline without first rewriting it as an
 * assertion with a nonzero exit on failure.
 *
 * Ground-truth contrast measurement from real rendered pixels.
 *
 * Two earlier approaches were wrong and this script avoids both:
 *
 *  - Walking the ancestor chain for a backdrop is wrong wherever an
 *    absolutely-positioned child (the hero photo + scrim) paints over an opaque
 *    ancestor background. That reported the production dark-mode hero headline
 *    at 1.11:1 when it actually renders at 14.8:1.
 *
 *  - Splitting a crop's pixels into two luminance clusters with k-means is
 *    blind to the failure it most needs to catch: text that is nearly the same
 *    luminance as its background lands in the same cluster as the background,
 *    so a 1.18:1 near-invisible wordmark measured as 5.03:1.
 *
 * So: sample the padding ring around the element for the background (that ring
 * is always background, never glyphs), and take the foreground from the
 * element's own computed colour. Contrast is then computed between the two
 * colours the browser actually produced.
 */
import { chromium } from "playwright";
import sharp from "sharp";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const PAD = 4;

/** Leaf text whose contrast matters. */
const TARGETS = [
  { name: "hero h1", selector: "main section h1" },
  { name: "hero paragraph", selector: "main section p" },
  { name: "hero badge", selector: "main section .rounded-full span" },
  { name: "header logo img", selector: "header img", graphic: true },
  { name: "header wordmark", selector: "header a[aria-label] > div > span:first-child" },
  { name: "header wordmark .place", selector: 'header a[aria-label] span > span[style], header a[aria-label] > div > span:first-child > span' },
  { name: "header subtitle", selector: "header a[aria-label] > div > span:last-child" },
  { name: "header nav link", selector: "header nav a span" },
  { name: "header active nav link", selector: "header nav a[aria-current] span" },
  { name: "highlights chip", selector: "main + div a, body > div a" },
];

const srgb = (css) => {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, a];
};

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Median colour of the ring of pixels just outside the element's box. */
function ringBackground(pixels, width, height, inset) {
  const picks = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    picks.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onRing =
        x >= inset && x < width - inset && y >= inset && y < height - inset
          ? false
          : true;
      if (onRing) push(x, y);
    }
  }
  if (!picks.length) return null;
  picks.sort((a, b) => luminance(a) - luminance(b));
  const mid = picks[Math.floor(picks.length / 2)];
  return { rgb: mid, n: picks.length };
}

const browser = await chromium.launch();
const rows = [];

for (const theme of THEMES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("header");
  await page.waitForTimeout(2000);

  for (const target of TARGETS) {
    const loc = page.locator(target.selector).first();
    if ((await loc.count()) === 0) { rows.push({ theme, target: target.name, error: "not found" }); continue; }
    const box = await loc.boundingBox();
    if (!box || box.width < 3 || box.height < 3) { rows.push({ theme, target: target.name, error: "no box" }); continue; }

    const clip = {
      x: Math.max(0, Math.floor(box.x) - PAD),
      y: Math.max(0, Math.floor(box.y) - PAD),
      width: Math.ceil(box.width) + PAD * 2,
      height: Math.ceil(box.height) + PAD * 2,
    };
    if (clip.x + clip.width > 1440) clip.width = 1440 - clip.x;
    if (clip.y + clip.height > 900) clip.height = 900 - clip.y;

    const buf = await page.screenshot({ clip, scale: "css" });
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const ring = ringBackground(data, info.width, info.height, PAD + 1);
    const fg = await loc.evaluate((n) => getComputedStyle(n).color);
    const fgRgb = srgb(fg) ?? (target.graphic ? await loc.evaluate((n) => {
      // For an <img> the "colour" is whatever it paints; sample its centre.
      return getComputedStyle(n).backgroundColor;
    }) : null);
    const fontSize = await loc.evaluate((n) => parseFloat(getComputedStyle(n).fontSize) || 0);
    const fontWeight = await loc.evaluate((n) => getComputedStyle(n).fontWeight);

    let fgFinal = fgRgb;
    let source = "computed";
    if (target.graphic || !fgRgb) {
      // Average the glyph pixels: those that differ most from the ring colour.
      const [br, bg, bb] = ring.rgb;
      let R = 0, G = 0, B = 0, n = 0;
      const inset = PAD + 1;
      for (let y = inset; y < info.height - inset; y++) {
        for (let x = inset; x < info.width - inset; x++) {
          const i = (y * info.width + x) * 3;
          const dist = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb);
          if (dist > 90) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; }
        }
      }
      if (n) { fgFinal = [Math.round(R / n), Math.round(G / n), Math.round(B / n)]; source = "pixels"; }
    }
    if (!fgFinal || !ring) { rows.push({ theme, target: target.name, error: "unresolved colour" }); continue; }

    const ratio = contrast(luminance(fgFinal), luminance(ring.rgb));
    const large = fontSize >= 24 || (fontSize >= 18.66 && Number(fontWeight) >= 700);
    const min = target.graphic ? 3 : large ? 3 : 4.5;
    rows.push({
      theme,
      target: target.name,
      fontSize: fontSize || null,
      fg: fgFinal,
      bg: ring.rgb,
      source,
      ratio: +ratio.toFixed(2),
      min,
      pass: ratio >= min,
    });
  }
  await page.close();
}

await browser.close();

console.log("rendered-pixel contrast  (fg = declared/averaged glyph colour, bg = median of the ring around the element)\n");
for (const r of rows) {
  if (r.error) { console.log(`  ${r.theme.padEnd(5)} ${r.target.padEnd(24)} ERROR ${r.error}`); continue; }
  console.log(
    `  ${r.theme.padEnd(5)} ${r.target.padEnd(24)} ${String(r.fontSize ?? "-").padStart(5)}px  ` +
    `${String(r.ratio).padStart(6)}:1 (need ${r.min})  fg=rgb(${r.fg.join(",")}) bg=rgb(${r.bg.join(",")})  ${r.pass ? "PASS" : "FAIL"}`,
  );
}
const failed = rows.filter((r) => !r.error && !r.pass);
console.log(`\n${failed.length} failing of ${rows.filter((r) => !r.error).length} measured`);
process.exitCode = failed.length ? 1 : 0;
