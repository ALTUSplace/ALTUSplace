/**
 * DIAGNOSTIC ONLY - interactive one-off, not a gate.
 * Requires a browser and a running dev server, and its output is for a human
 * to read. Not wired into any npm script or CI workflow, and not covered by
 * tests. Do not add it to a pipeline without first rewriting it as an
 * assertion with a nonzero exit on failure.
 *
 * Reports the geometry of client/public/assets/images/logo.png: the alpha
 * bounding box (what is actually visible), how much of the canvas is
 * transparent padding, and therefore how many CSS pixels the visible mark
 * really occupies once the <img> is sized to a fixed height.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "client/public/assets/images/logo.png";
const { width: w, height: h, channels, density, hasAlpha } = await sharp(path).metadata();

const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

let minX = w, minY = h, maxX = -1, maxY = -1, visible = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * channels + 3] > 16) {
      visible++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const bytes = readFileSync(path).length;

console.log(JSON.stringify({
  file: path,
  bytes,
  canvas: { w, h, channels, density, hasAlpha },
  content: { minX, minY, maxX, maxY, w: cw, h: ch },
  contentAspect: +(cw / ch).toFixed(3),
  canvasAspect: +(w / h).toFixed(3),
  visiblePixelPct: +((visible / (w * h)) * 100).toFixed(1),
  paddingPct: {
    left: +((minX / w) * 100).toFixed(1),
    right: +(((w - 1 - maxX) / w) * 100).toFixed(1),
    top: +((minY / h) * 100).toFixed(1),
    bottom: +(((h - 1 - maxY) / h) * 100).toFixed(1),
  },
  // What the visible mark measures once the <img> box is 48 CSS px tall.
  renderedAt48pxTall: {
    imgBox: { w: +((w / h) * 48).toFixed(1), h: 48 },
    visibleMark: { w: +((cw / h) * 48).toFixed(1), h: +((ch / h) * 48).toFixed(1) },
  },
}, null, 2));
