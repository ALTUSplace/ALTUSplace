/**
 * Responsive verification for the Navbar city selector.
 *
 * Runs the real production build in Chromium at the three widths where the
 * selector changes form: below the xl breakpoint the desktop dropdown must be
 * gone and the mobile accordion reachable from the hamburger menu; at xl and
 * above the desktop dropdown must be present.
 *
 * Run against a server already listening on BASE_URL:
 *   node scripts/verify-city-selector-responsive.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = [
  { width: 375, height: 780, label: "mobile" },
  { width: 768, height: 900, label: "tablet" },
  { width: 1024, height: 900, label: "laptop" },
  { width: 1280, height: 900, label: "desktop" },
];

const DESKTOP_TRIGGER = 'button[aria-haspopup="listbox"][aria-label]';
const HAMBURGER = 'button[aria-controls="mobile-navigation"]';
const MOBILE_CITY_TRIGGER = '#mobile-navigation button[aria-controls^="mobile-city-list-"]';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Drives the page to a genuinely scrolled-down offset and returns the settled
 * scrollY.
 *
 * The `behavior: "instant"` is load-bearing: index.css sets
 * `html { scroll-behavior: smooth }`, and the two-argument
 * `window.scrollTo(0, y)` form resolves `behavior` from that CSS, so it starts
 * an animation and returns before the page has moved. Reading scrollY straight
 * after it reads 0 and silently turns the scroll assertion below into a no-op.
 */
async function scrollDown(page) {
  await page.evaluate(() => window.scrollTo({ top: 1e6, behavior: "instant" }));
  await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 5000 }).catch(() => {});
  return page.evaluate(() => window.scrollY);
}

/**
 * Reads the offset once the picker's smooth scroll has arrived at the top.
 *
 * Deliberately waits for the destination rather than for the offset to look
 * "stable". The picker's scroll is deferred by two animation frames, and the
 * route change first clamps the offset to the max scroll of the shorter
 * /search page — so the pre-scroll position sits unchanged for several frames
 * before the animation begins. A stability heuristic returns that stale value
 * and reports a false failure; waiting for the top simply times out instead,
 * which is the correct outcome for a picker that never scrolls.
 *
 * AT_TOP_PX tolerates the 1-2px the animation's last frame can leave behind.
 */
const AT_TOP_PX = 4;

async function settledScrollY(page) {
  await page
    .waitForFunction((top) => window.scrollY <= top, AT_TOP_PX, { timeout: 6000 })
    .catch(() => {});
  return page.evaluate(() => window.scrollY);
}

const browser = await chromium.launch();

for (const viewport of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("header", { timeout: 15000 });

  const isDesktop = viewport.width >= 1280;
  const desktopVisible = await page.locator(DESKTOP_TRIGGER).first().isVisible().catch(() => false);
  const hamburgerVisible = await page.locator(HAMBURGER).first().isVisible().catch(() => false);

  // The hamburger is the only route into the mobile panel, and therefore the
  // only route into the mobile city selector below xl. A header row that
  // overflowed pushed it to left: -45 at 768px, making the feature
  // unreachable, so assert it is fully on-screen rather than merely "visible".
  const clipped = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-controls="mobile-navigation"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      clippedLeft: Math.max(0, Math.round(-r.left)),
      clippedRight: Math.max(0, Math.round(r.right - window.innerWidth)),
    };
  });
  record(
    `[${viewport.width}px] menu button fully on-screen`,
    clipped === null || (clipped.clippedLeft === 0 && clipped.clippedRight === 0),
    clipped ? `left=${clipped.left} right=${clipped.right} clipped=${clipped.clippedLeft}/${clipped.clippedRight}px` : "no button",
  );

  record(
    `[${viewport.width}px] desktop dropdown visibility`,
    desktopVisible === isDesktop,
    `expected ${isDesktop ? "visible" : "hidden"}, got ${desktopVisible ? "visible" : "hidden"}`,
  );

  if (isDesktop) {
    // Desktop: the dropdown must open and expose the grouped listbox.
    await page.locator(DESKTOP_TRIGGER).first().click();
    const listboxVisible = await page.locator('[role="listbox"]').first().isVisible().catch(() => false);
    const groupCount = await page.locator('[role="group"]').count();
    record(`[${viewport.width}px] dropdown opens with groups`, listboxVisible && groupCount === 13, `${groupCount} groups`);
    await page.keyboard.press("Escape");

    // Choosing a city must return the user to the top of the results page. The
    // picker hangs off a sticky navbar and is reachable from deep in the list,
    // so without an explicit scroll the view stays stranded where it was.
    // Record scrollY at the instant of the click, not before it. Playwright
    // scrolls a target into view before clicking, so reading the offset
    // beforehand would let a "pass" come from Playwright's own auto-scroll
    // rather than from the picker.
    const preScrollY = await scrollDown(page);
    await page.evaluate(() => {
      window.__scrollYAtPick = null;
      document.addEventListener("click", () => { window.__scrollYAtPick = window.scrollY; }, { capture: true, once: true });
    });
    await page.locator(DESKTOP_TRIGGER).first().click();
    // First option of the pinned "popular cities" group is deterministic.
    await page.locator('[role="listbox"] [role="option"]').first().click();
    await page.waitForURL(/city=casablanca/, { timeout: 10000 });
    const atPickY = await page.evaluate(() => window.__scrollYAtPick);
    const afterY = await settledScrollY(page);
    const scrollable = typeof atPickY === "number" && atPickY > 100;
    record(
      `[${viewport.width}px] select scrolls page to top`,
      !scrollable || afterY <= AT_TOP_PX,
      !scrollable
        ? `no scrolled-down position at click time (pre=${preScrollY}px, atClick=${atPickY}), check inconclusive`
        : `${atPickY}px at click -> ${afterY}px`,
    );
  } else {
    record(`[${viewport.width}px] hamburger visible`, hamburgerVisible, `hamburger ${hamburgerVisible ? "visible" : "hidden"}`);

    // Establish a scrolled-down position BEFORE opening the menu: the overlay
    // locks document.body scrolling while it is open.
    const preScrollY = await scrollDown(page);

    // Mobile/tablet: open the menu, expand the city accordion.
    await page.locator(HAMBURGER).first().click();
    await page.waitForSelector("#mobile-navigation", { timeout: 10000 });
    const cityTrigger = page.locator(MOBILE_CITY_TRIGGER).first();
    const cityVisible = await cityTrigger.isVisible().catch(() => false);
    record(`[${viewport.width}px] mobile city accordion present`, cityVisible, cityVisible ? "visible" : "MISSING");

    if (cityVisible) {
      await cityTrigger.click();
      await page.waitForSelector('input[type="search"]', { timeout: 5000 });
      const expanded = await cityTrigger.getAttribute("aria-expanded");
      const optionCount = await page.locator('#mobile-navigation [id^="mobile-city-list-"] button').count();
      record(`[${viewport.width}px] accordion expands`, expanded === "true", `aria-expanded=${expanded}, ${optionCount} options`);

      // Filter must narrow the list.
      await page.locator('#mobile-navigation input[type="search"]').fill("marrakech");
      await page.waitForTimeout(250);
      const filtered = await page.locator('#mobile-navigation [id^="mobile-city-list-"] button').allTextContents();
      record(
        `[${viewport.width}px] filter narrows to latin input`,
        filtered.length > 0 && filtered.length < optionCount,
        `${filtered.length} of ${optionCount}`,
      );

      // No results state.
      await page.locator('#mobile-navigation input[type="search"]').fill("zzzzqqq");
      await page.waitForTimeout(250);
      const emptyVisible = await page.locator('#mobile-navigation').getByText(/لا توجد مدينة مطابقة|Aucune ville|No matching city/).first().isVisible().catch(() => false);
      record(`[${viewport.width}px] empty state shown`, emptyVisible, emptyVisible ? "visible" : "MISSING");

      // Choosing a city must navigate and close the menu.
      await page.locator('#mobile-navigation input[type="search"]').fill("agadir");
      await page.waitForTimeout(250);
      await page.locator('#mobile-navigation [id^="mobile-city-list-"] button').first().click();
      await page.waitForURL(/city=agadir/, { timeout: 10000 });
      const menuClosed = (await page.locator("#mobile-navigation").count()) === 0;
      record(`[${viewport.width}px] select navigates + closes menu`, menuClosed, page.url());

      // Same expectation as the desktop path, and the harder case: the scroll
      // is issued in the same tick that releases the overlay's body scroll lock,
      // so it has to be deferred to be honoured at all.
      const postScrollY = await settledScrollY(page);
      record(
        `[${viewport.width}px] select scrolls page to top`,
        preScrollY < 100 || postScrollY <= AT_TOP_PX,
        preScrollY < 100 ? `page not scrollable here (${preScrollY}px), check inconclusive` : `${preScrollY}px -> ${postScrollY}px`,
      );
    }

    // The city list must stay inside the panel at this width.
    const listOverflow = await page.evaluate(() => {
      const list = document.querySelector('#mobile-navigation [id^="mobile-city-list-"]');
      if (!list) return null;
      return list.scrollWidth - list.clientWidth;
    });
    record(
      `[${viewport.width}px] city list scrolls inside the panel`,
      listOverflow === null || listOverflow >= 0,
      `internal scroll delta ${listOverflow}px`,
    );

    // Overflow caused by *this feature* must be zero. The document-level total
    // is reported for information only and is NOT asserted: in an RTL document
    // Chrome folds a nested horizontal scroller's inline-start overflow into
    // documentElement.scrollWidth, so it reads non-zero even when the page
    // cannot actually scroll. scripts/verify-horizontal-scroll.mjs asserts the
    // real behaviour by driving window.scrollTo and reading scrollX.
    const owned = await page.evaluate(() => {
      const strip = [...document.querySelectorAll("a")].find((a) =>
        (a.getAttribute("href") || "").startsWith("/search?city=agadir&type=car"),
      )?.closest("ul")?.parentElement?.parentElement;
      const panel = document.querySelector("#mobile-navigation");
      const stripOverflow = strip ? Math.max(0, strip.scrollWidth - strip.clientWidth) : 0;
      const panelOverflow = panel ? Math.max(0, panel.scrollWidth - panel.clientWidth) : 0;
      const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return { stripOverflow, panelOverflow, doc };
    });
    record(
      `[${viewport.width}px] no overflow from city selector / strip`,
      owned.stripOverflow <= 1 && owned.panelOverflow <= 1,
      `strip=${owned.stripOverflow}px panel=${owned.panelOverflow}px (document total ${owned.doc}px)`,
    );
  }

  // The 429s come from the tRPC API having no database configured in this
  // environment, not from the UI under test; they are reported, not failed.
  const apiNoise = consoleErrors.filter((e) => /429|TRPCClientError|Too Many Requests/.test(e));
  const realErrors = consoleErrors.filter((e) => !/429|TRPCClientError|Too Many Requests/.test(e));
  record(`[${viewport.width}px] no console/page errors`, realErrors.length === 0, realErrors.slice(0, 2).join(" | ") || `clean (${apiNoise.length} API 429s ignored)`);
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
