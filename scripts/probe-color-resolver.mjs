/**
 * Prints the resolved colour values behind a few hero nodes, to validate the canvas resolver.
 *
 * DIAGNOSTIC ONLY - interactive one-off, not a gate.
 * Requires a browser and a running dev server, and its output is for a human
 * to read. Not wired into any npm script or CI workflow, and not covered by
 * tests. Do not add it to a pipeline without first rewriting it as an
 * assertion with a nonzero exit on failure.
 */
import { chromium } from "playwright";
import { PAGE_HELPERS } from "./lib/page-helpers.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.addInitScript(() => window.localStorage.setItem("theme", "dark"));
await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
await page.reload({ waitUntil: "load" });
await page.waitForSelector("main section");
await page.waitForTimeout(1500);

const out = await page.evaluate(`${PAGE_HELPERS}
  (() => {
    const h1 = document.querySelector('main section h1');
    const s = getComputedStyle(h1);
    const chain = [];
    let n = h1;
    while (n && n.nodeType === 1) {
      chain.push({
        tag: n.tagName.toLowerCase(),
        cls: (n.className || '').toString().slice(0, 40),
        bg: getComputedStyle(n).backgroundColor,
        bgImage: getComputedStyle(n).backgroundImage.slice(0, 70),
      });
      n = n.parentElement;
    }
    return {
      h1Color: s.color,
      h1ColorResolved: rgba(s.color),
      h1Size: parseFloat(s.fontSize),
      backdrop: backdropOf(h1),
      chain: chain.slice(0, 6),
      fullChainLen: chain.length,
    };
  })()
`);
console.log(JSON.stringify(out, null, 2));
await browser.close();
