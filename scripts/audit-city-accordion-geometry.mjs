/**
 * Geometry audit of the mobile city accordion, standing in for a visual check.
 *
 * Verifies at each breakpoint that:
 *  - every city button sits fully inside the panel horizontally
 *  - every interactive row meets the --tap-target minimum
 *  - no label is visually truncated (scrollWidth <= clientWidth)
 *  - the group headers are present and the list is internally scrollable
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = [375, 768, 1024];

const browser = await chromium.launch();
let failures = 0;

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("header");
  await page.waitForTimeout(1000);
  await page.locator('button[aria-controls="mobile-navigation"]').first().click();
  await page.waitForSelector("#mobile-navigation");
  await page.locator('#mobile-navigation button[aria-controls^="mobile-city-list-"]').first().click();
  await page.waitForSelector('#mobile-navigation input[type="search"]');
  await page.waitForTimeout(500);

  const audit = await page.evaluate(() => {
    const panel = document.querySelector("#mobile-navigation");
    // The element carrying the id is the outer wrapper; the bounded scroll
    // region is its last child.
    const wrapper = document.querySelector('#mobile-navigation [id^="mobile-city-list-"]');
    const list = wrapper.lastElementChild;
    const panelRect = panel.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    // --tap-target is authored in rem, so it must be resolved to px to compare
    // against measured heights.
    const rem = parseFloat(rootStyle.fontSize) || 16;
    const tapTarget =
      parseFloat(rootStyle.getPropertyValue("--tap-target")) * rem || 44;

    const buttons = [...list.querySelectorAll("button")];
    const outside = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.left < panelRect.left - 0.5 || r.right > panelRect.right + 0.5;
    });
    const tooSmall = buttons
      .map((b) => ({ h: b.getBoundingClientRect().height, t: (b.textContent || "").trim().slice(0, 18) }))
      .filter((x) => x.h < tapTarget - 0.5);
    const truncated = buttons
      .map((b) => ({ sw: b.scrollWidth, cw: b.clientWidth, t: (b.textContent || "").trim().slice(0, 18) }))
      .filter((x) => x.sw > x.cw + 1);

    const headers = [...list.querySelectorAll("p")].map((p) => (p.textContent || "").trim());
    const groups = headers.length;
    const popularIndex = headers.findIndex((h) => /مطلوبة|populaires|Popular/i.test(h));

    const input = wrapper.querySelector('input[type="search"]');
    const inputRect = input.getBoundingClientRect();
    const listStyle = getComputedStyle(list);
    // The filter sits in the wrapper ABOVE the list, so visibility is judged
    // against the panel and the viewport, not against the list box.
    const inputVisible =
      inputRect.width > 0 &&
      inputRect.height > 0 &&
      inputRect.top >= panelRect.top - 0.5 &&
      inputRect.left >= panelRect.left - 0.5 &&
      inputRect.right <= panelRect.right + 0.5 &&
      inputRect.top < window.innerHeight &&
      inputRect.bottom > 0;

    return {
      tapTarget: Math.round(tapTarget),
      buttonCount: buttons.length,
      buttonHeights: [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().height)))],
      outsideCount: outside.length,
      tooSmall: tooSmall.slice(0, 3),
      truncated: truncated.slice(0, 3),
      groups,
      popularFirst: popularIndex === 0,
      firstThreeHeaders: headers.slice(0, 3),
      listOverflowY: listStyle.overflowY,
      listMaxHeight: listStyle.maxHeight,
      listClientH: list.clientHeight,
      listScrollH: list.scrollHeight,
      listScrollable: list.scrollHeight > list.clientHeight + 1,
      inputVisible,
      inputFocused: document.activeElement === input,
    };
  });

  console.log(`\n=== @${width}px ===`);
  console.log(JSON.stringify(audit, null, 2));

  const bad = [];
  if (audit.outsideCount > 0) bad.push(`${audit.outsideCount} buttons outside panel`);
  if (audit.tooSmall.length) bad.push(`${audit.tooSmall.length} rows under ${audit.tapTarget}px`);
  if (audit.truncated.length) bad.push(`${audit.truncated.length} truncated labels`);
  if (!audit.listScrollable) bad.push("list is not internally scrollable");
  if (audit.listOverflowY !== "auto" && audit.listOverflowY !== "scroll")
    bad.push(`list overflow-y is ${audit.listOverflowY}`);
  if (!audit.popularFirst) bad.push("popular group is not first");
  if (!audit.inputVisible) bad.push("filter box not visible");
  if (!audit.inputFocused) bad.push("filter box not focused on expand");
  if (bad.length) {
    failures++;
    console.log(`  ISSUES: ${bad.join("; ")}`);
  } else {
    console.log("  OK: all geometry checks pass");
  }
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nAll widths clean." : `\n${failures} width(s) with issues.`);
process.exit(failures === 0 ? 0 : 1);
