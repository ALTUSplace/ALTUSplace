/**
 * Does the page ACTUALLY scroll horizontally at a given width?
 *
 * documentElement.scrollWidth is unreliable in RTL documents (Chrome reports the
 * inline-start overflow of nested scrollers), so this drives a real scroll and
 * reports the resulting scrollX — the number a user would perceive.
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = [375, 768, 1024];

const browser = await chromium.launch();
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("header");
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const before = window.scrollX;
    window.scrollTo(400, 0);
    const afterRight = window.scrollX;
    window.scrollTo(-400, 0);
    const afterLeft = window.scrollX;
    window.scrollTo(0, 0);
    // Which element, if any, reports itself as scrollable in x?
    const scrollables = [...document.querySelectorAll("*")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible")
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);
    return {
      scrollXInitial: before,
      scrollXAfterScrollRight: afterRight,
      scrollXAfterScrollLeft: afterLeft,
      internalScrollers: scrollables.slice(0, 6),
    };
  });
  console.log(`@${width}px  scrollX start=${r.scrollXInitial} afterScrollRight=${r.scrollXAfterScrollRight} afterScrollLeft=${r.scrollXAfterScrollLeft}`);
  console.log(`         internal x-scrollers: ${JSON.stringify(r.internalScrollers)}`);
  await page.close();
}
await browser.close();
