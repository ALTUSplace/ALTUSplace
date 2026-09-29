/**
 * Measures the three classes of homepage defect the brief calls out, in both
 * themes and at every breakpoint, so a "fine in dark mode" fix cannot quietly
 * regress light mode (and vice versa):
 *
 *   1. header  — brand lockup vs navigation vs controls: overlap, clipping,
 *                and whether the logo mark is actually legible against the bar.
 *   2. hero    — text contrast over the animated-gradient backdrop, and
 *                glassmorphism surfaces whose translucency lets the backdrop
 *                bleed through the text sitting on them.
 *   3. overlay  — floating chrome (bottom bar, chat, WhatsApp) landing on top
 *                of hero controls inside the first screenful.
 *
 * Run: BASE_URL=https://altusplace.vercel.app node scripts/audit-home-visual.mjs
 */
import { chromium } from "playwright";
import { PAGE_HELPERS, GLASS_SELECTOR, TEXT_SELECTOR } from "./lib/page-helpers.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = (process.env.WIDTHS ?? "375,768,1024,1440").split(",").map(Number);
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
/** Only report an overlay collision that a user actually sees without scrolling. */
const VIEWPORT_H = 900;

const collect = `${PAGE_HELPERS}
  (() => {
    const header = document.querySelector('header');
    const row = header.querySelector(':scope > div');
    const logo = header.querySelector('img');
    const brand = logo ? logo.closest('a') : null;

    const kids = [...row.children]
      .filter((el) => getComputedStyle(el).display !== 'none' && rectOf(el).w > 0)
      .map((el, i) => ({
        i,
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 46),
        isNav: el.tagName === 'NAV',
        r: rectOf(el),
      }));

    // Leaf text inside the header, with the colour actually painted on it.
    const headerText = [];
    const seen = new Set();
    for (const el of header.querySelectorAll('span, a, button, label')) {
      if (el.children.length > 0) continue;
      const label = describe(el);
      if (!label) continue;
      const s = getComputedStyle(el);
      const key = label + s.color;
      if (seen.has(key)) continue;
      seen.add(key);
      headerText.push({
        label,
        color: s.color,
        contrast: contrast(rgba(s.color), backdropOf(el)),
        fontSize: parseFloat(s.fontSize),
        fontWeight: s.fontWeight,
      });
    }

    // The logo mark as painted: its own average colour, and its rendered size.
    let logoInfo = null;
    if (logo && logo.complete && logo.naturalWidth > 0) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let avg = null;
      try {
        // Synchronous path: reuse the already-decoded bitmap via a canvas draw.
        const c = document.createElement('canvas');
        c.width = logo.naturalWidth; c.height = logo.naturalHeight;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(logo, 0, 0);
        const d = cx.getImageData(0, 0, c.width, c.height).data;
        let R = 0, G = 0, B = 0, n = 0, minX = c.width, minY = c.height, maxX = -1, maxY = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (d[i + 3] > 200) {
              R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (n) {
          avg = [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
          const cw = maxX - minX + 1, ch = maxY - minY + 1;
          const scale = rectOf(logo).h / c.height;
          logoInfo = {
            avg,
            headerBg: backdropOf(logo).slice(0, 3).map(Math.round),
            contrast: contrast(avg, backdropOf(logo)),
            natural: [c.width, c.height],
            content: [cw, ch],
            visibleAtRenderedSize: [Math.round(cw * scale), Math.round(ch * scale)],
            fillPct: +((n / (c.width * c.height)) * 100).toFixed(1),
          };
        }
      } catch (e) { logoInfo = { error: String(e).slice(0, 60) }; }
    }

    // Hero: text and glass surfaces.
    const hero = document.querySelector('main section');
    const heroText = [];
    const glass = [];
    if (hero) {
      for (const el of hero.querySelectorAll('${TEXT_SELECTOR}')) {
        if (el.children.length > 0) continue;
        const isInput = el.tagName === 'INPUT' || el.tagName === 'SELECT';
        const label = isInput ? el.type : describe(el);
        if (!label) continue;
        const s = getComputedStyle(el);
        heroText.push({
          label,
          tag: el.tagName.toLowerCase(),
          contrast: contrast(rgba(s.color), backdropOf(el)),
          fontSize: parseFloat(s.fontSize),
          fontWeight: s.fontWeight,
        });
      }
      for (const el of hero.querySelectorAll('${GLASS_SELECTOR}')) {
        const s = getComputedStyle(el);
        glass.push({
          cls: (el.className || '').toString().slice(0, 60),
          bg: s.backgroundColor,
          alpha: rgba(s.backgroundColor)[3],
        });
      }
    }

    // Floating chrome and what it lands on, restricted to the first screenful.
    const floating = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed') return false;
        const r = rectOf(el);
        return r.w > 0 && r.h > 0 && r.bottom > 0 && r.top < ${VIEWPORT_H};
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 52),
        z: getComputedStyle(el).zIndex,
        r: rectOf(el),
      }));

    const heroControls = hero
      ? [...hero.querySelectorAll('button, a[href], input, select, [role="tablist"], form')]
          .filter((el) => rectOf(el).w > 0)
          .map((el) => ({ tag: el.tagName.toLowerCase(), label: describe(el), r: rectOf(el) }))
      : [];

    return {
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      rowH: rectOf(row).h,
      headerH: rectOf(header).h,
      kids,
      headerText,
      logoInfo,
      heroText,
      glass,
      floating,
      heroControls,
    };
  })()
`;

const browser = await chromium.launch();
const problems = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: VIEWPORT_H }, colorScheme: theme });
    await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("header");
    await page.waitForTimeout(1500);

    const d = await page.evaluate(collect);
    const tag = `${d.theme}@${width}`;

    // ── 1. header geometry ────────────────────────────────────────────────
    const brandKid = d.kids.find((k) => k.tag === "a");
    for (const k of d.kids) {
      if (k === brandKid) continue;
      const ov = overlap(brandKid?.r, k.r);
      if (ov > 1) {
        problems.push(`${tag} brand lockup overlaps <${k.tag} class="${k.cls}"> by ${Math.round(ov)}px²`);
      }
    }
    for (const [i, a] of d.kids.entries()) {
      for (const b of d.kids.slice(i + 1)) {
        const ov = overlap(a.r, b.r);
        if (ov > 1) problems.push(`${tag} header <${a.tag}> overlaps <${b.tag} class="${b.cls}"> by ${Math.round(ov)}px²`);
      }
      if (a.r.left < -0.5 || a.r.right > width + 0.5) {
        problems.push(`${tag} header <${a.tag} class="${a.cls}"> clipped (left=${Math.round(a.r.left)} right=${Math.round(a.r.right)})`);
      }
    }
    if (brandKid && brandKid.r.h > d.rowH + 0.5) {
      problems.push(`${tag} brand lockup ${Math.round(brandKid.r.h)}px exceeds header row ${Math.round(d.rowH)}px`);
    }

    // ── 1b. is the logo mark legible? ─────────────────────────────────────
    if (d.logoInfo && !d.logoInfo.error) {
      const l = d.logoInfo;
      if (l.contrast < 3) {
        problems.push(
          `${tag} logo mark rgb(${l.avg}) on header rgb(${l.headerBg}) contrast ${l.contrast}:1 (need >= 3 for a graphic)`,
        );
      }
      const [vw, vh] = l.visibleAtRenderedSize;
      if (vw < 24 || vh < 24) {
        problems.push(
          `${tag} logo mark renders at only ${vw}x${vh}px visible (source ${l.natural.join("x")}, content ${l.content.join("x")}, ${l.fillPct}% of canvas is opaque)`,
        );
      }
    }

    // ── 2. header text contrast ───────────────────────────────────────────
    for (const t of d.headerText) {
      const min = minRatio(t.fontSize, t.fontWeight);
      if (t.contrast < min) {
        problems.push(`${tag} header text "${t.label}" ${t.fontSize}px contrast ${t.contrast}:1 (need ${min})`);
      }
    }

    // ── 3. hero text contrast + glassmorphism ─────────────────────────────
    for (const t of d.heroText) {
      const min = minRatio(t.fontSize, t.fontWeight);
      if (t.contrast < min) {
        problems.push(`${tag} hero <${t.tag}> "${t.label}" ${t.fontSize}px contrast ${t.contrast}:1 (need ${min})`);
      }
    }
    for (const g of d.glass) {
      if (g.alpha > 0 && g.alpha < 1) {
        problems.push(`${tag} hero glass surface translucency alpha=${g.alpha.toFixed(2)} class="${g.cls}"`);
      }
    }

    // ── 4. floating chrome over hero controls in the first screenful ──────
    for (const f of d.floating) {
      for (const c of d.heroControls) {
        const ov = overlap(f.r, c.r);
        if (ov > 64) {
          problems.push(`${tag} fixed <${f.tag} class="${f.cls}"> covers hero <${c.tag} "${c.label}"> by ${Math.round(ov)}px²`);
        }
      }
    }

    await page.close();
  }
}

await browser.close();

function overlap(a, b) {
  if (!a || !b) return 0;
  return (
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  );
}
function minRatio(fontSize, fontWeight) {
  const large = fontSize >= 24 || (fontSize >= 18.66 && Number(fontWeight) >= 700);
  return large ? 3 : 4.5;
}

if (problems.length === 0) {
  console.log("homepage visual audit: no problems detected");
} else {
  const byKind = new Map();
  for (const p of problems) {
    const key = p.replace(/^(light|dark)@\d+\s+/, "").replace(/"[^"]*"/g, '"…"').replace(/-?[\d.]+px²/g, "Npx²").replace(/[\d.]+:1/g, "N:1");
    if (!byKind.has(key)) byKind.set(key, []);
    byKind.get(key).push(p);
  }
  console.log(`homepage visual audit: ${problems.length} problem(s), ${byKind.size} distinct kind(s)\n`);
  for (const [, list] of byKind) {
    for (const p of list) console.log(`  - ${p}`);
    console.log("");
  }
}
process.exitCode = problems.length ? 1 : 0;
