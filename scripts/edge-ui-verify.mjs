/**
 * edge-ui-verify.mjs — automated Light/Dark visibility probe for the
 * ALTUSplace header + search surfaces (PR #57 token adoption).
 *
 * Checks computed styles (not screenshots) for the reported defects:
 *   1. Header wordmark "ALTUSplace"   -> ink must not match its effective bg
 *   2. NavSelector dropdown options   -> text >= 4.5:1 against the menu surface
 *   3. Search (compact) date picker   -> not forced to light scheme in dark mode
 *   4. Mobile drawer links            -> non-white ink on the (light) drawer
 *
 * Colours may be serialized as `rgb()`, `color(srgb ...)`, `hsl()` or `oklch()`;
 * all are normalised to RGBA, and translucent ink is composited over its bg.
 *
 * Usage:  node scripts/edge-ui-verify.mjs [baseUrl]
 * Exit code 1 if any assertion fails (HALT signal).
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? process.argv[2] ?? "https://altusplace.vercel.app";
const failures = [];
let checks = 0;

const push = (ok, label, detail) => {
  checks++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? `  -> ${detail}` : ""}`);
  if (!ok) failures.push({ label, detail });
};

const fmt = (c) => (c ? `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})` : "none");
const ratio = (r) => (r == null ? "n/a" : r.toFixed(2) + ":1");

function lum(c) {
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}
function contrast(a, b) {
  if (!a || !b) return null;
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function over(fg, bg) {
  if (!fg) return fg;
  const a = fg.a == null ? 1 : fg.a;
  if (a >= 1) return fg;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
const ratioOf = (fg, bg) => contrast(over(fg, bg), bg);

/* In-page helpers injected into every evaluate. */
const HELPERS = `
  function toRGBA(css) {
    if (!css) return null;
    const s = String(css).trim().toLowerCase();
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (s[0] === '#') {
      const h = s.slice(1);
      const exp = (x) => parseInt(x, 16);
      if (h.length === 3) return { r: exp(h[0]+h[0]), g: exp(h[1]+h[1]), b: exp(h[2]+h[2]), a: 1 };
      if (h.length === 6) return { r: exp(h.slice(0,2)), g: exp(h.slice(2,4)), b: exp(h.slice(4,6)), a: 1 };
      if (h.length === 8) return { r: exp(h.slice(0,2)), g: exp(h.slice(2,4)), b: exp(h.slice(4,6)), a: exp(h.slice(6,8))/255 };
      return null;
    }
    let m = s.match(/^rgba?\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s,/]+/).filter(Boolean);
      const num = (x) => x.indexOf('%') >= 0 ? parseFloat(x) * 2.55 : parseFloat(x);
      return { r: num(p[0]), g: num(p[1]), b: num(p[2]), a: p[3] != null ? num(p[3]) : 1 };
    }
    m = s.match(/^color\\(\\s*srgb\\s+([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] != null ? p[3] : 1 };
    }
    m = s.match(/^hsla?\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s,/]+/).filter(Boolean);
      const h = ((parseFloat(p[0]) % 360) + 360) % 360 / 360;
      const sl = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100;
      if (sl === 0) { const v = l * 255; return { r: v, g: v, b: v, a: p[3] != null ? parseFloat(p[3]) : 1 }; }
      const q = l < 0.5 ? l * (1 + sl) : l + sl - l * sl, pp = 2 * l - q;
      const hue = (t) => { t = (t + 1) % 1; if (t < 1/6) return pp + (q - pp) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return pp + (q - pp) * (2/3 - t) * 6; return pp; };
      return { r: hue(h + 1/3) * 255, g: hue(h) * 255, b: hue(h - 1/3) * 255, a: p[3] != null ? parseFloat(p[3]) : 1 };
    }
    m = s.match(/^oklab\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s/]+/).filter(Boolean);
      const L = parseFloat(p[0]); const a_ = parseFloat(p[1]); const b_ = parseFloat(p[2]); const A = p[3] != null ? parseFloat(p[3]) : 1;
      const l_ = L + 0.3963377774 * a_ + 0.2158037573 * b_;
      const m_ = L - 0.1055613458 * a_ - 0.0638541728 * b_;
      const s_ = L - 0.0894841775 * a_ - 1.2914855480 * b_;
      const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
      const lin = [
        +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
      ];
      const gm = (v) => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return { r: Math.max(0, Math.min(255, gm(lin[0]) * 255)), g: Math.max(0, Math.min(255, gm(lin[1]) * 255)), b: Math.max(0, Math.min(255, gm(lin[2]) * 255)), a: A };
    }
    m = s.match(/^oklch\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s/]+/).filter(Boolean);
      const L = parseFloat(p[0]); const C = parseFloat(p[1]); const H = parseFloat(p[2]) * Math.PI / 180; const A = p[3] != null ? parseFloat(p[3]) : 1;
      const a_ = C * Math.cos(H), b_ = C * Math.sin(H);
      const l_ = L + 0.3963377774 * a_ + 0.2158037573 * b_;
      const m_ = L - 0.1055613458 * a_ - 0.0638541728 * b_;
      const s_ = L - 0.0894841775 * a_ - 1.2914855480 * b_;
      const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
      const lin = [
        +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
      ];
      const g = (v) => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return { r: Math.max(0, Math.min(255, g(lin[0]) * 255)), g: Math.max(0, Math.min(255, g(lin[1]) * 255)), b: Math.max(0, Math.min(255, g(lin[2]) * 255)), a: A };
    }
    return null;
  }
  function effectiveBg(el) {
    const stack = [];
    let node = el;
    while (node) {
      const c = toRGBA(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.01) stack.push(c);
      node = node.parentElement;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) {
      const l = stack[i];
      bg = { r: l.r * l.a + bg.r * (1 - l.a), g: l.g * l.a + bg.g * (1 - l.a), b: l.b * l.a + bg.b * (1 - l.a), a: 1 };
    }
    return bg;
  }
  function snapshot(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    let indicatorOpacity = null;
    try {
      const ind = getComputedStyle(el, '::-webkit-calendar-picker-indicator');
      if (ind && ind.opacity) indicatorOpacity = parseFloat(ind.opacity);
    } catch {}
    return {
      color: toRGBA(cs.color), bg: effectiveBg(el),
      colorScheme: cs.colorScheme, text: (el.textContent || '').trim().slice(0, 40),
      indicatorOpacity,
    };
  }
`;

const evalPage = (page, body) => page.evaluate(`(() => {${HELPERS}\n${body}})()`);

async function newPage(browser, theme, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const page = await context.newPage();
  return { context, page };
}

async function probeDesktop(browser, theme) {
  console.log(`\n=== ${theme.toUpperCase()} MODE (desktop) ===`);
  const { context, page } = await newPage(browser, theme, { width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header");
  await page.waitForTimeout(2500);

  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  push(isDark === (theme === "dark"), `html .dark class reflects ${theme}`, `dark=${isDark}`);

  const tokenVal = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--brand-panel-accent").trim());
  push(tokenVal.toUpperCase() === "#8AB4FF", "--brand-panel-accent token = #8AB4FF", `got "${tokenVal}"`);

  /* 1. wordmark + nav links on the always-dark header chrome */
  for (const [label, sel] of [
    ["wordmark", "header span.font-display"],
    ["inactive nav link", "header nav a:not([aria-current])"],
    ["active nav link", "header nav a[aria-current='page']"],
  ]) {
    const s = await evalPage(page, `return snapshot(${JSON.stringify(sel)});`);
    if (!s || !s.color) { push(false, `[${theme}] ${label} found`, `selector ${sel} empty/unparsed`); continue; }
    const cr = ratioOf(s.color, s.bg);
    const same = s.color.r === s.bg.r && s.color.g === s.bg.g && s.color.b === s.bg.b && (s.color.a ?? 1) >= 1;
    push(!same && cr >= 4.5, `[${theme}] ${label} "${s.text}" visible (>= 4.5:1)`,
      `color=${fmt(s.color)} bg=${fmt(s.bg)} ratio=${ratio(cr)}`);
  }

  /* 2. NavSelector dropdown options */
  const trigger = page.getByRole("button", { name: "MAD", exact: true });
  if (await trigger.count() === 0) {
    push(false, `[${theme}] currency NavSelector trigger present`, "no exact-'MAD' button in header");
  } else {
    await trigger.first().click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 }).catch(() => {});
    const opts = await evalPage(page, `return Array.from(document.querySelectorAll('[role="option"]')).map((el) => {
        const cs = getComputedStyle(el);
        return { text: (el.textContent || '').trim(), color: toRGBA(cs.color), bg: effectiveBg(el) };
      });`);
    push(opts.length >= 3, `[${theme}] dropdown options rendered`, `count=${opts.length}`);
    for (const o of opts) {
      const cr = ratioOf(o.color, o.bg);
      push(cr >= 4.5, `[${theme}] option "${o.text}" >= 4.5:1`, `color=${fmt(o.color)} bg=${fmt(o.bg)} ratio=${ratio(cr)}`);
    }
    await page.keyboard.press("Escape").catch(() => {});
  }

  /* live toggle cycle: wordmark must not vanish when switching at runtime */
  const toggle = page.locator("header button:has(svg.lucide-moon), header button:has(svg.lucide-sun)");
  if (await toggle.count() > 0) {
    await toggle.first().click();
    await page.waitForTimeout(700);
    const nowDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    push(nowDark === (theme !== "dark"), `[${theme}] header toggle flips mode at runtime`, `now dark=${nowDark}`);
    const wm2 = await evalPage(page, "return snapshot('header span.font-display');");
    const cr2 = wm2 && wm2.color ? ratioOf(wm2.color, wm2.bg) : null;
    push(!!wm2 && !!wm2.color && cr2 >= 4.5, `[${theme}->toggle] wordmark still visible`,
      `color=${wm2 ? fmt(wm2.color) : "none"} bg=${wm2 ? fmt(wm2.bg) : "none"} ratio=${ratio(cr2)}`);
  } else {
    push(false, `[${theme}] theme toggle button found`, "no lucide-moon/sun button in header");
  }

  await context.close();
}

/* Non-overlay (compact) date picker lives on /search. */
async function probeSearchDate(browser, theme) {
  console.log(`\n=== ${theme.toUpperCase()} MODE (search compact date picker) ===`);
  const { context, page } = await newPage(browser, theme, { width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/search`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="date"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const s = await evalPage(page, `return snapshot('input[type="date"]');`);
  if (!s || !s.color) {
    push(false, `[${theme}] compact date input present`, "no parsed input[type=date] on /search");
  } else {
    const cr = ratioOf(s.color, s.bg);
    push(cr >= 4.5, `[${theme}] date value text >= 4.5:1`, `color=${fmt(s.color)} bg=${fmt(s.bg)} ratio=${ratio(cr)}`);
    if (theme === "dark") {
      push(s.colorScheme === "dark", `[dark] date input color-scheme is dark (no forced light)`, `colorScheme=${s.colorScheme}`);
      if (s.indicatorOpacity != null) push(s.indicatorOpacity > 0, `[dark] calendar-picker-indicator opacity > 0`, `opacity=${s.indicatorOpacity}`);
    } else {
      push(s.colorScheme.indexOf("light") >= 0, `[light] date input color-scheme light`, `colorScheme=${s.colorScheme}`);
    }
  }
  await context.close();
}

async function probeMobile(browser, theme) {
  console.log(`\n=== ${theme.toUpperCase()} MODE (mobile drawer) ===`);
  const { context, page } = await newPage(browser, theme, { width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[aria-controls="mobile-navigation"]');
  await page.waitForTimeout(1500);
  await page.click('button[aria-controls="mobile-navigation"]');
  await page.waitForSelector("#mobile-navigation");
  await page.waitForTimeout(500);

  const data = await evalPage(page, `const aside = document.querySelector('#mobile-navigation');
    return {
      drawerBg: effectiveBg(aside),
      links: Array.from(aside.querySelectorAll('nav a')).map((a) => ({
        text: (a.textContent || '').trim().slice(0, 24),
        color: toRGBA(getComputedStyle(a).color),
        bg: effectiveBg(a),
        isCurrent: a.getAttribute('aria-current') === 'page',
      })),
    };`);

  push(data.links.length > 0, `[${theme}] mobile drawer has nav links`, `count=${data.links.length}`);
  for (const l of data.links) {
    const cr = ratioOf(l.color, l.bg);
    const c = l.color;
    const isWhite = c && c.r > 250 && c.g > 250 && c.b > 250;
    // The active item is a filled pill (white-on-blue) and is intentionally white;
    // the defect was white ink on the *plain* light drawer surface.
    const whiteOk = theme === "dark" || l.isCurrent || !isWhite;
    push(cr >= 4.5 && whiteOk,
      `[${theme}] drawer link "${l.text}"${l.isCurrent ? " (active)" : ""} >= 4.5:1${theme === "light" ? " & non-white" : ""}`,
      `color=${fmt(l.color)} bg=${fmt(l.bg)} ratio=${ratio(cr)}`);
  }
  await context.close();
}

/* ---- main ---- */
console.log(`edge-ui-verify  base=${BASE_URL}`);
const browser = await chromium.launch();
try {
  for (const t of ["light", "dark"]) await probeDesktop(browser, t);
  for (const t of ["light", "dark"]) await probeSearchDate(browser, t);
  for (const t of ["light", "dark"]) await probeMobile(browser, t);
} finally {
  await browser.close();
}

console.log(`\n============================================`);
console.log(`checks=${checks}  failures=${failures.length}`);
if (failures.length) {
  console.log("RESULT: HALT — assertions failed:");
  for (const f of failures) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("RESULT: all assertions passed");