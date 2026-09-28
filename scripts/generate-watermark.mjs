/**
 * Generates server/assets/watermark-altus.png — the wordmark that
 * server/imageWatermark.ts composites onto every uploaded listing image.
 *
 * The wordmark is rendered with the DejaVu Sans face that already ships in
 * server/assets (see scripts/generate-favicons.mjs for the same
 * generate-an-asset-from-repo-inputs idea). Text is drawn via sharp's Pango
 * `text` input with an explicit `fontfile`: embedding the font in an SVG
 * data-URI does NOT work, because sharp's bundled librsvg has no fontconfig
 * fallback and silently renders nothing.
 *
 * A dark translucent plate sits behind the glyphs so the mark stays legible
 * on bright photos as well as dark ones — plain white text at 0.3 alpha
 * disappears against a white wall or an overexposed sky.
 *
 * Output is rendered oversized and trimmed, so the runtime can scale it down
 * to any target width without upscaling artefacts.
 *
 * Usage: node scripts/generate-watermark.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const FONT = path.join(ROOT, "server", "assets", "DejaVuSans.ttf");
const OUT = path.join(ROOT, "server", "assets", "watermark-altus.png");

// Rendered at 600dpi, then trimmed: ~600px wide, which downscales cleanly for
// typical listing photos and holds up on large uploads.
const DPI = 600;
const TEXT = '<span foreground="#ffffff">ALTUSplace</span>';
const FONT_FAMILY = "DejaVu Sans";

// Padding around the glyph box, and the plate's inset from that box.
const GLYPH_PAD = 24;
const PLATE_INSET = 14;
const PLATE_RADIUS = 28;
const PLATE_COLOR = "#0b1220";
const PLATE_ALPHA = 0.42; // combined with the 0.3 composite alpha at runtime

if (!readFileSync(FONT).length) throw new Error(`Missing font: ${FONT}`);

// 1. Render the wordmark, cropped to the actual glyph bounds.
const text = await sharp({
  text: { text: TEXT, font: FONT_FAMILY, fontfile: FONT, width: 4000, rgba: true, dpi: DPI },
})
  .png()
  .toBuffer();

const { width: tw, height: th } = await sharp(text).metadata();
if (!tw || !th) throw new Error("Watermark text render produced no dimensions");

// 2. Build the plate behind it, then centre the glyphs on the plate.
const plateW = tw + PLATE_INSET * 2;
const plateH = th + PLATE_INSET * 2;
const plate = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}">
     <rect x="0" y="0" width="${plateW}" height="${plateH}" rx="${PLATE_RADIUS}" ry="${PLATE_RADIUS}"
           fill="${PLATE_COLOR}" fill-opacity="${PLATE_ALPHA}"/>
   </svg>`,
);

const composed = await sharp(plate)
  .composite([{ input: text, left: PLATE_INSET, top: PLATE_INSET, blend: "over" }])
  // Trim fully-transparent margins so the runtime's proportional scaling
  // measures the visible mark, not a padded canvas.
  .trim({ threshold: 1 })
  .png({ compressionLevel: 9 })
  .toBuffer();

const meta = await sharp(composed).metadata();
writeFileSync(OUT, composed);

console.log(
  `Written: ${path.relative(ROOT, OUT)} (${meta.width}x${meta.height}, ${composed.length} bytes)`,
);
