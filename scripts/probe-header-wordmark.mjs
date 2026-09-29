/** Diagnostic: what colour is the header wordmark actually painted, and where is the crop? */
import { chromium } from "playwright";
import sharp from "sharp";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();

for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("header");
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const header = document.querySelector("header");
    const link = header.querySelector("a[aria-label]");
    const spans = [...link.querySelectorAll("span")].map((s) => ({
      text: s.textContent.trim(),
      color: getComputedStyle(s).color,
      rect: s.getBoundingClientRect().toJSON(),
    }));
    return {
      isDark: document.documentElement.classList.contains("dark"),
      headerBg: getComputedStyle(header).backgroundColor,
      headerRect: header.getBoundingClientRect().toJSON(),
      linkRect: link.getBoundingClientRect().toJSON(),
      linkAriaLabel: link.getAttribute("aria-label"),
      spans,
    };
  });

  const loc = page.locator("header a[aria-label] span").first();
  const box = await loc.boundingBox();
  const buf = await page.screenshot({ clip: box, scale: "css" });
  const { data, info: meta } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < meta.width * meta.height; i++) {
    const k = `${data[i * meta.channels]},${data[i * meta.channels + 1]},${data[i * meta.channels + 2]}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => `${k} x${n}`);

  console.log(`--- ${theme} ---`);
  console.log("  isDark:", info.isDark, " headerBg:", info.headerBg);
  console.log("  link box:", JSON.stringify(info.linkRect));
  console.log("  spans:", JSON.stringify(info.spans.map((s) => ({ t: s.text, c: s.color, x: Math.round(s.rect.x), y: Math.round(s.rect.y), w: Math.round(s.rect.width), h: Math.round(s.rect.height) }))));
  console.log("  first span box:", JSON.stringify(box));
  console.log("  crop size:", meta.width, "x", meta.height);
  console.log("  top colors in crop:", top.join(" | "));
  await page.close();
}
await browser.close();
