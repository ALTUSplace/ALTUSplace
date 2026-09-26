/**
 * Captures the city selector at each breakpoint for visual review.
 * Output: C:\Users\kml\AppData\Local\Temp\opencode\shots\city-<width>.png
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "C:/Users/kml/AppData/Local/Temp/opencode/shots";
await mkdir(OUT, { recursive: true });

const SHOTS = [
  { width: 375, height: 780, mobile: true },
  { width: 768, height: 900, mobile: true },
  { width: 1024, height: 900, mobile: true },
  { width: 1280, height: 900, mobile: false },
];

const browser = await chromium.launch();
for (const s of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
  });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("header");
  await page.waitForTimeout(1200);

  if (s.mobile) {
    await page.locator('button[aria-controls="mobile-navigation"]').first().click();
    await page.waitForSelector("#mobile-navigation");
    await page.waitForTimeout(400);
    // 1: closed accordion — shows the entry point is reachable.
    await page.screenshot({ path: `${OUT}/city-${s.width}-a-entry.png` });
    // 2: expanded — shows the list, filter box and scroll region.
    await page.locator('#mobile-navigation button[aria-controls^="mobile-city-list-"]').first().click();
    await page.waitForSelector('#mobile-navigation input[type="search"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/city-${s.width}-b-expanded.png` });
  } else {
    await page.locator('button[aria-haspopup="listbox"][aria-label]').first().click();
    await page.waitForSelector('[role="listbox"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/city-${s.width}-a-entry.png` });
  }
  console.log(`captured ${s.width}px`);
  await page.close();
}
await browser.close();
