/**
 * Opens every header dropdown in both themes and reports the contrast of each
 * option row against the panel it sits on.
 *
 * The desktop panels are `bg-bg-elevated`, which is #FFFFFF in light mode, so
 * any option styled with `text-white/80` (a header-tinted colour) is invisible
 * there. Colour comparison happens in-page via a canvas-backed resolver, so
 * Chrome's oklab()/color(srgb …) serialisation cannot skew the result.
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const THEMES = ["light", "dark"];

const RESOLVER = `
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  function rgba(css) {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  const over = (fg, bg) => [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    1,
  ];
  const lum = ([r, g, b]) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const x = lum(a), y = lum(b);
    return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2);
  };
  /** The colour actually painted behind el, composited down the ancestor chain. */
  function backdropOf(el) {
    const stack = [];
    let n = el;
    while (n && n !== document.documentElement.parentNode) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] === 1) break; }
      n = n.parentElement;
    }
    stack.push([255, 255, 255, 1]);
    return stack.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255, 1]);
  }
`;

const browser = await chromium.launch();
const problems = [];

for (const theme of THEMES) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
  });
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("header nav");
  await page.waitForTimeout(1200);

  const triggers = [
    { name: "language", title: /لغة|اللغة|Langue|Language|اللغات/i },
    { name: "currency", title: /عملة|Worke|Currency/i },
    { name: "city", title: /مدن|Cities|Villes/i },
  ];

  for (const trig of triggers) {
    const btn = page.locator("header button[aria-haspopup]").filter({ hasText: trig.name === "language" ? /عربي|FR|EN/ : trig.name === "currency" ? /MAD|EUR|USD/ : /./ }).nth(trig.name === "city" ? 2 : trig.name === "currency" ? 1 : 0);
    let opened = false;
    try {
      await btn.click({ timeout: 4000 });
      await page.waitForSelector('[role="listbox"], [role="menu"]', { timeout: 4000 });
      opened = true;
    } catch {
      problems.push(`${theme}@1440 could not open the ${trig.name} dropdown`);
      continue;
    }
    if (!opened) continue;

    const rows = await page.evaluate(`${RESOLVER}
      (() => {
        const panel = document.querySelector('header [role="listbox"]');
        if (!panel) return { error: "no panel" };
        const panelBg = backdropOf(panel);
        const out = [];
        for (const el of panel.querySelectorAll('[role="option"], button')) {
          const label = (el.textContent || "").trim();
          if (!label) continue;
          const s = getComputedStyle(el);
          const own = rgba(s.color);
          const rowBg = own[3] > 0 ? over(own, backdropOf(el)) : backdropOf(el);
          out.push({
            label: label.slice(0, 22),
            fontSize: parseFloat(s.fontSize),
            color: s.color,
            bg: s.backgroundColor,
            contrastVsPanel: contrast(own, panelBg),
            contrastVsOwnRow: contrast(rowBg[0] === undefined ? panelBg : over(rgba(s.color), backdropOf(el)), backdropOf(el)),
          });
        }
        return { panelBg: panelBg.slice(0, 3).map(Math.round), rows: out.slice(0, 8) };
      })()
    `);

    if (rows.error) { problems.push(`${theme}@1440 ${trig.name}: ${rows.error}`); continue; }
    for (const r of rows.rows) {
      const min = r.fontSize >= 24 || r.fontSize >= 18.66 ? 3 : 4.5;
      if (r.contrastVsPanel < min) {
        problems.push(
          `${theme}@1440 ${trig.name} option "${r.label}" contrast ${r.contrastVsPanel}:1 vs panel rgb(${rows.panelBg}) (need ${min}) color=${r.color} bg=${r.bg}`,
        );
      }
    }
    await page.keyboard.press("Escape");
    await page.mouse.click(720, 700);
    await page.waitForTimeout(200);
  }

  await page.close();
}

await browser.close();

if (problems.length === 0) console.log("dropdown audit: no problems detected");
else {
  console.log(`dropdown audit: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
}
