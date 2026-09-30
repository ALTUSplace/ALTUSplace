/**
 * DIAGNOSTIC ONLY - interactive one-off, not a gate.
 * Requires a browser and a running dev server, and its output is for a human
 * to read. Not wired into any npm script or CI workflow, and not covered by
 * tests. Do not add it to a pipeline without first rewriting it as an
 * assertion with a nonzero exit on failure.
 *
 * Reports the geometry and dominant colours of every brand image in
 * client/public, so the header lockup can be sized from real content rather
 * than from the PNG canvas (which may carry large transparent margins).
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const files = [
  "client/public/assets/images/logo.png",
  "client/public/images/logo.png",
  "client/public/images/icon-192.png",
  "client/public/images/icon-512.png",
  "client/public/favicon.ico",
];

for (const path of files) {
  let meta;
  try {
    meta = await sharp(path).metadata();
  } catch (err) {
    console.log(JSON.stringify({ file: path, error: String(err.message).slice(0, 80) }));
    continue;
  }
  const { width: w, height: h, channels } = meta;
  const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let minX = w, minY = h, maxX = -1, maxY = -1, visible = 0;
  // Bucket visible pixels by colour so we can see what the mark is actually
  // painted with (a dark-on-transparent mark would vanish on a navy header).
  const buckets = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      if (data[i + 3] > 32) {
        visible++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }
  }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const top = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => {
      const [r, g, b] = k.split(",").map((v) => (Number(v) * 32) + 16);
      return { rgb: [r, g, b], pct: +((n / Math.max(1, visible)) * 100).toFixed(1) };
    });

  console.log(JSON.stringify({
    file: path,
    bytes: readFileSync(path).length,
    canvas: { w, h, channels, hasAlpha: meta.hasAlpha, format: meta.format },
    content: { minX, minY, maxX, maxY, w: cw, h: ch },
    contentAspect: +(cw / ch).toFixed(3),
    canvasAspect: +(w / h).toFixed(3),
    visiblePixelPct: +((visible / (w * h)) * 100).toFixed(1),
    emptyPaddingPct: +(100 - ((cw * ch) / (w * h)) * 100).toFixed(1),
    dominantColors: top,
  }));
}
