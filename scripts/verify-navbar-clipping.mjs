/** Are the navbar controls fully inside the viewport at a given width? */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = [375, 768, 1024, 1280];

const browser = await chromium.launch();
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("header");
  await page.waitForTimeout(1200);

  const r = await page.evaluate((vw) => {
    const header = document.querySelector("header");
    const report = [];
    for (const el of header.querySelectorAll("button, a")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const clippedLeft = Math.max(0, Math.round(-b.left));
      const clippedRight = Math.max(0, Math.round(b.right - vw));
      if (clippedLeft > 0 || clippedRight > 0) {
        report.push({
          label: el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 22) || el.tagName,
          left: Math.round(b.left),
          right: Math.round(b.right),
          clippedLeft,
          clippedRight,
        });
      }
    }
    return report;
  }, width);

  console.log(`@${width}px  clipped header controls: ${r.length === 0 ? "none" : ""}`);
  for (const c of r) console.log(`    "${c.label}" left=${c.left} right=${c.right} clippedL=${c.clippedLeft} clippedR=${c.clippedRight}`);
  await page.close();
}
await browser.close();
