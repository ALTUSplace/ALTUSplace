/**
 * Generates client/public/images/og-default.png — the 1200x630 social card
 * referenced by og:image / twitter:image.
 *
 * Rendered in Chromium (Playwright) rather than sharp: the card is
 * Arabic-first, and only a real text stack does HarfBuzz shaping plus bidi.
 * sharp's bundled librsvg has no fontconfig (see generate-watermark.mjs), and
 * its Pango `text:` input would need a local Arabic TTF on disk. The browser
 * also lets the card use the same webfonts the site already ships (Tajawal for
 * Arabic, Plus Jakarta Sans for Latin), so the card matches the live UI.
 *
 * The mark is trimmed to its alpha bounds before embedding: client/public/
 * images/logo.png is a 1000x558 canvas whose visible mark is only 244x326 in
 * the middle, so dropping it in untrimmed would render the brand ~3% of the
 * card's width.
 *
 * Output is a flat PNG at exactly 1200x630 (the OG spec ratio, 1.905:1),
 * quantised to a 256-colour palette so the file lands well under the 100 kB
 * social-card budget. A truecolour PNG of the same card is ~318 kB — 3.6x the
 * bytes for output that looks identical at card scale — and the scrapers that
 * ignore WebP (WhatsApp in particular) require a PNG or JPEG, so palette PNG is
 * the format that satisfies both constraints. logo.png is 1000x558 (1.792:1),
 * which forces letterboxing or centre-crop in Twitter/X and LinkedIn previews.
 *
 * Usage: node scripts/generate-og-image.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOGO = path.join(ROOT, "client", "public", "images", "logo.png");
const OUT = path.join(ROOT, "client", "public", "images", "og-default.png");

const WIDTH = 1200;
const HEIGHT = 630;

// Social-card download budget, in bytes. Enforced below so regenerating the
// card can never silently ship a heavier file than the optimised one committed
// to client/public/images/og-default.png.
const OG_BUDGET_BYTES = 100 * 1024;

// Lockup tile geometry. Sized so the icon+wordmark crop stays legible while
// the two flex children still fit the 478px content box with slack to spare.
const TILE_H = 132;
const TILE_PAD = 18;

// Brand palette, mirrored from client/src/index.css :root so the card cannot
// drift from the app's tokens.
const BRAND = {
  accent: "#1A56DB",
  accentHover: "#1546B4",
  panel: "#123A93",
  panel2: "#0B2E6F",
  navy: "#0B1220",
  navyDeep: "#060A12",
  ink: "#FFFFFF",
  inkMuted: "rgba(255, 255, 255, 0.72)",
  inkFaint: "rgba(255, 255, 255, 0.58)",
  hairline: "rgba(255, 255, 255, 0.16)",
};

/**
 * Crop the brand lockup out of logo.png and return it as a data URI.
 *
 * client/public/images/logo.png is a 1000x558 canvas whose visible mark is a
 * 244x326 stacked lockup in the middle: rows 0-238 are the icon, 252-291 are
 * the "ALTUSplace" wordmark, and 301-325 are a tagline. The padding is trimmed
 * away here, and the tagline band is dropped — at card scale it would render
 * ~11px tall and read as a smudge.
 *
 * The mark is dark (mean #484846), because it was drawn for the white navbar,
 * so the card gives it a light tile rather than recolouring it: the lockup
 * carries a warm accent that a white knockout would destroy.
 */
async function markDataUri() {
  // sharp's `.metadata()` reports the INPUT geometry, not the pipeline's
  // output, so each stage has to be materialised before its bounds are read.
  const trimmed = await sharp(LOGO).trim({ threshold: 1 }).png().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  if (!width || !height) throw new Error(`Could not read mark geometry from ${LOGO}`);

  const TAGLINE_START = 0.92; // measured: tagline band begins at row 301/326
  const crop = Math.round(height * TAGLINE_START);
  const lockup = await sharp(trimmed).extract({ left: 0, top: 0, width, height: crop }).png().toBuffer();
  const lm = await sharp(lockup).metadata();
  const aspect = lm.width / lm.height;
  if (aspect < 0.6 || aspect > 1.1) {
    throw new Error(`Lockup aspect ${aspect.toFixed(2)} is unexpected — has logo.png changed?`);
  }

  console.log(`Mark: 1000x558 canvas -> trim ${width}x${height} -> lockup ${lm.width}x${lm.height} (tagline dropped)`);
  return { uri: `data:image/png;base64,${lockup.toString("base64")}`, aspect };
}

const { uri: mark, aspect: markAspect } = await markDataUri();

const html = /* html */ `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@500;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    font-family: 'Tajawal', 'Plus Jakarta Sans', system-ui, sans-serif;
    background: linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyDeep} 58%, ${BRAND.panel2} 100%);
    color: ${BRAND.ink};
    -webkit-font-smoothing: antialiased;
  }
  /* Blue glow anchored to the RTL start edge, plus a faint grid for texture. */
  .glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(720px 520px at 88% 12%, rgba(26, 86, 219, 0.55) 0%, rgba(26, 86, 219, 0) 62%),
      radial-gradient(560px 460px at 6% 96%, rgba(18, 58, 147, 0.42) 0%, rgba(18, 58, 147, 0) 60%);
  }
  .grid {
    position: absolute; inset: 0; opacity: 0.5;
    background-image:
      linear-gradient(${BRAND.hairline} 1px, transparent 1px),
      linear-gradient(90deg, ${BRAND.hairline} 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(1000px 640px at 50% 40%, #000 0%, transparent 78%);
    -webkit-mask-image: radial-gradient(1000px 640px at 50% 40%, #000 0%, transparent 78%);
  }
  .stage {
    position: relative; z-index: 1;
    width: ${WIDTH}px; height: ${HEIGHT}px;
    padding: 76px 84px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  /* The lockup is dark artwork for a light navbar, so it sits on a light tile
     rather than being knocked out to white. */
  .tile {
    background: #FFFFFF;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(3, 8, 20, 0.45);
    display: flex; align-items: center; justify-content: center;
    width: ${Math.round(TILE_H * markAspect + TILE_PAD * 2)}px;
    height: ${TILE_H}px;
    padding: ${TILE_PAD}px;
  }
  .tile img { height: ${TILE_H - TILE_PAD * 2}px; width: auto; display: block; }
  h1 {
    font-size: 63px; font-weight: 800; line-height: 1.24;
    letter-spacing: -0.005em;
    max-width: 1010px;
    text-wrap: balance;
  }
  .sub {
    font-size: 33px; font-weight: 500; line-height: 1.5;
    color: ${BRAND.inkMuted};
    margin-top: 18px;
  }
  .rule { height: 1px; background: ${BRAND.hairline}; margin: 30px 0 22px; }
  .foot {
    font-family: 'Plus Jakarta Sans', 'Tajawal', sans-serif;
    font-size: 24px; font-weight: 500; line-height: 1.45;
    color: ${BRAND.inkFaint};
    direction: ltr; text-align: right;
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="grid"></div>
  <div class="stage">
    <div>
      <div class="tile"><img src="${mark}" alt="ALTUSplace"></div>
    </div>

    <div>
      <h1>كراء السيارات والعقارات في المغرب</h1>
      <p class="sub">أفضل العروض بأسعار تنافسية</p>
      <div class="rule"></div>
      <p class="foot">Location de voitures et de biens immobiliers au Maroc</p>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  // Assert the Arabic webfont actually loaded. `document.fonts.check` is the
  // only reliable signal here: a silent webfont failure still lays out text in
  // a fallback face, which would ship a card that is subtly the wrong type.
  const fontOk = await page.evaluate(() => document.fonts.check('800 63px Tajawal'));
  if (!fontOk) throw new Error("Tajawal 800 did not load — refusing to render a fallback-typed card");

  // Confirm the Arabic headline actually laid out (non-zero box) before
  // committing bytes. A zero-height box means the font never loaded.
  const headlineBox = await page.locator("h1").boundingBox();
  if (!headlineBox || headlineBox.height < 20 || headlineBox.width < 200) {
    throw new Error(`Headline did not lay out (box: ${JSON.stringify(headlineBox)})`);
  }

  // Hard overflow guard: nothing may spill past the card, and no element may
  // cross the stage's padding box. Catches a longer headline string wrapping to
  // a third line, which a screenshot would silently crop.
  const PAD_X = 84;
  const PAD_Y = 76;
  const overflow = await page.evaluate(({ w, h, padX, padY }) => {
    const bad = [];
    for (const el of document.querySelectorAll(".tile, h1, .sub, .rule, .foot, img")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (
        r.bottom > h - padY + 0.5 || r.top < padY - 0.5 ||
        r.right > w - padX + 0.5 || r.left < padX - 0.5
      ) {
        bad.push(`${el.className || el.tagName}: ${Math.round(r.left)},${Math.round(r.top)} -> ${Math.round(r.right)},${Math.round(r.bottom)}`);
      }
    }
    return { bad, scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth };
  }, { w: WIDTH, h: HEIGHT, padX: PAD_X, padY: PAD_Y });

  if (overflow.scrollH > HEIGHT || overflow.scrollW > WIDTH) {
    throw new Error(`Card overflows: scroll ${overflow.scrollW}x${overflow.scrollH} vs ${WIDTH}x${HEIGHT}`);
  }
  if (overflow.bad.length) {
    throw new Error(`Element(s) outside the 84px safe area:\n  ${overflow.bad.join("\n  ")}`);
  }

  const card = await page.screenshot({ type: "png" });

  // Flatten to sRGB 8-bit, quantise to a palette and assert exact dimensions.
  // Palette PNG (not WebP): WhatsApp and several other link scrapers ignore
  // WebP for og:image and fall back to a text-only preview, which defeats the
  // point of shipping a smaller card.
  const final = await sharp(card)
    .toColorspace("srgb")
    .png({ palette: true, quality: 88, compressionLevel: 9, effort: 10 })
    .toBuffer();

  if (final.length > OG_BUDGET_BYTES) {
    throw new Error(
      `Card is ${(final.length / 1024).toFixed(1)} kB, over the ${OG_BUDGET_BYTES / 1024} kB social-card ` +
        `budget — lower png.quality in this script before shipping.`,
    );
  }

  const meta = await sharp(final).metadata();
  writeFileSync(OUT, final);

  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    throw new Error(`Expected ${WIDTH}x${HEIGHT}, got ${meta.width}x${meta.height}`);
  }

  // Blankness guard: sample real pixels rather than trusting the layout above.
  const stats = await sharp(final).stats();
  const [r, g, b] = stats.channels.map(c => c.mean);
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) {
    throw new Error(`Card looks blank (channel means r=${r.toFixed(1)} g=${g.toFixed(1)} b=${b.toFixed(1)})`);
  }

  console.log(
    `Written: ${path.relative(ROOT, OUT)} (${meta.width}x${meta.height}, ` +
      `${(final.length / 1024).toFixed(1)} kB of ${OG_BUDGET_BYTES / 1024} kB budget, ` +
      `means r=${r.toFixed(1)} g=${g.toFixed(1)} b=${b.toFixed(1)})`,
  );
  console.log(`Headline box: ${Math.round(headlineBox.width)}x${Math.round(headlineBox.height)} at y=${Math.round(headlineBox.y)}`);
} finally {
  await browser.close();
}
