/**
 * Layout gate for the photographic hero.
 *
 * Runs the BUILT client (see scripts/serve-dist.mjs for why the dev server
 * cannot be measured) at the 375px mobile breakpoint first, then desktop, and
 * asserts the hero contract:
 *
 *   - the page never scrolls horizontally at 375px
 *   - the glass search card actually carries a translucent fill + backdrop blur
 *   - the Cars/Properties tabs switch in place (no navigation, no reload)
 *   - the 3 numbered steps render
 *   - the category rail is horizontally scrollable at 375px and its
 *     photographs actually decode
 *
 * Usage: node scripts/verify-hero-layout.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4173";

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Runs in the page. Returns the measured hero state. */
const probe = () => {
  const q = (s) => document.querySelector(s);
  const hero = q('section[aria-labelledby="hero-heading"]');
  const h1 = q("#hero-heading");
  const steps = hero ? hero.querySelector("ol") : null;
  const tablist = q('[role="tablist"]');
  const showcase = q('section[aria-labelledby="hero-showcase-title"]');
  const rail = showcase ? showcase.querySelector("ul") : null;
  const cards = rail ? Array.from(rail.querySelectorAll("li")) : [];
  const heroImg = hero ? hero.querySelector("img") : null;

  // The glass surface is the SearchBar card: the form's own rounded wrapper.
  const form = hero ? hero.querySelector("form") : null;
  const card = form ? form.parentElement : null;
  const cardStyle = card ? getComputedStyle(card) : null;

  const firstCardImg = cards[0] ? cards[0].querySelector("img") : null;
  const firstCardMedia = firstCardImg ? firstCardImg.parentElement : null;
  const mediaStyle = firstCardMedia ? getComputedStyle(firstCardMedia) : null;
  const cardLink = cards[0] ? cards[0].querySelector("a") : null;
  const imgStyle = firstCardImg ? getComputedStyle(firstCardImg) : null;

  return {
    dir: document.documentElement.getAttribute("dir"),
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    h1: h1
      ? {
          text: h1.innerText.replace(/\s+/g, " ").trim(),
          fontSize: parseFloat(getComputedStyle(h1).fontSize),
          color: getComputedStyle(h1).color,
          visible: h1.getBoundingClientRect().height > 0,
        }
      : null,
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
    stepLabels: steps
      ? Array.from(steps.querySelectorAll("li")).map((li) =>
          li.innerText.replace(/\s+/g, " ").trim(),
        )
      : [],
    tabTexts: tablist
      ? Array.from(tablist.querySelectorAll('[role="tab"]')).map((b) => ({
          text: b.innerText.trim(),
          selected: b.getAttribute("aria-selected"),
        }))
      : [],
    card: cardStyle
      ? {
          background: cardStyle.backgroundColor,
          border: cardStyle.borderTopWidth + " " + cardStyle.borderTopColor,
          backdrop: cardStyle.backdropFilter || cardStyle.webkitBackdropFilter,
          radius: cardStyle.borderTopLeftRadius,
        }
      : null,
    rail: rail
      ? {
          scrollW: rail.scrollWidth,
          clientW: rail.clientWidth,
          overflowX: getComputedStyle(rail).overflowX,
          snap: getComputedStyle(rail).scrollSnapType,
        }
      : null,
    cards: cards.map((c) => {
      const h3 = c.querySelector("h3");
      const i = c.querySelector("img");
      return {
        label: h3 ? h3.innerText.trim() : null,
        href: c.querySelector("a") ? c.querySelector("a").getAttribute("href") : null,
        imgDecoded: i ? i.complete && i.naturalWidth > 0 : false,
        naturalW: i ? i.naturalWidth : 0,
      };
    }),
    mediaOverflow: mediaStyle ? mediaStyle.overflow : null,
    imgTransform: imgStyle ? imgStyle.transform : null,
    imgTransition: imgStyle ? imgStyle.transitionDuration : null,
    cardLinkRadius: cardLink ? getComputedStyle(cardLink).borderTopLeftRadius : null,
  };
};

/**
 * Finds elements that visibly overflow the viewport WITHOUT being clipped away
 * by an ancestor, and returns the worst overflow in px (0 when there is none).
 *
 * Must be passed to page.evaluate (it is serialised into the page), which is why
 * it takes no arguments.
 *
 * Why not `documentElement.scrollWidth <= clientWidth`:
 *   On this page that comparison reports 587 against a 375px viewport — a false
 *   failure — while the page cannot actually be scrolled sideways at all
 *   (body.scrollWidth is an exact 375/375). The extra 212px is the scroll extent
 *   of `overflow: hidden` descendants: the listing-card media boxes measure
 *   scrollWidth 1364 against clientWidth 341 because of the hover-zoom
 *   transform. They are clipped, so no visitor ever scrolls to them.
 *
 * Why not "try to scroll, then read the offset":
 *   Because the page is RTL by default, and in RTL a one-directional scrollTo
 *   clamps to the right edge. Measured on this page, scrollTo(+9999) AND
 *   scrollTo(-9999) both report offset 0 *even with a real 900px overflow
 *   injected*, so that approach has no discriminating power at all.
 *
 * Asking "does anything stick out of the viewport that is not clipped?" is the
 * question a visitor would actually notice, and it is exact in both directions.
 * Verified against an injected 900px block (reported, 525px) and against the
 * clean page (reports 0). Both edges are checked because the page is RTL.
 */
const findUnclippedOverflow = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  let worst = 0;
  const offenders = [];

  for (const el of document.querySelectorAll("*")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    let clipped = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== "visible") {
        clipped = true;
        break;
      }
    }
    if (clipped) continue;

    const over = Math.max(rect.right - vw, -rect.left);
    if (over > 1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        over: Math.round(over),
        cls: String(el.className || "").slice(0, 60),
      });
      if (over > worst) worst = over;
    }
  }
  return { worst: Math.round(worst), offenders: offenders.slice(0, 5) };
};

const browser = await chromium.launch();
try {
  // ── Mobile first: 375px is the breakpoint the task calls out explicitly ──
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  const m = await mobile.newPage();
  // `networkidle` never settles here: the static preview has no tRPC backend,
  // so react-query keeps retrying /api/trpc and the network stays busy.
  await m.goto(BASE, { waitUntil: "load" });
  await m.waitForSelector("#hero-heading", { timeout: 30000 });

  // The category rail sits below the fold at 375px, so its photographs are
  // lazily loaded and have not decoded when the probe first runs. Forcing them
  // eager and awaiting decode() makes "the photographs actually decode" a real
  // assertion instead of a race against the lazy-loading heuristic — without
  // this the check reports imgDecoded=false/naturalW=0 for images that are
  // perfectly fine, which is a false negative on the gate.
  await m.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("img"));
    for (const img of imgs) img.loading = "eager";
    await Promise.all(
      imgs.map((img) =>
        img.complete ? null : img.decode().catch(() => null),
      ),
    );
  });
  const mState = await m.evaluate(probe);

  // "No horizontal page overflow" asks whether anything sticks out of the
  // viewport un-clipped. See findUnclippedOverflow for why neither
  // scrollWidth nor a scroll attempt answers that question correctly.
  //
  // Passed by reference, not wrapped in `() => findUnclippedOverflow()`: an
  // evaluate callback is serialised into the page, so a closure over this
  // module-scope helper would throw ReferenceError in the browser.
  const mobileOverflow = await m.evaluate(findUnclippedOverflow);

  record(
    "375px: no horizontal page overflow",
    mobileOverflow.worst === 0,
    `worst unclipped overflow=${mobileOverflow.worst}px ${JSON.stringify(mobileOverflow.offenders)} (docScrollW=${mState.docScrollW} docClientW=${mState.docClientW})`,
  );
  record("375px: RTL direction on <html>", mState.dir === "rtl", `dir=${mState.dir}`);
  record(
    "375px: H1 renders at mobile scale",
    !!mState.h1?.visible && mState.h1.fontSize >= 24,
    `fontSize=${mState.h1?.fontSize}px text="${mState.h1?.text}"`,
  );
  record(
    "375px: all 3 numbered steps render",
    mState.stepLabels.length === 3,
    JSON.stringify(mState.stepLabels),
  );
  record(
    "375px: both search tabs render",
    mState.tabTexts.length === 2,
    JSON.stringify(mState.tabTexts),
  );
  record(
    "375px: glass card is translucent + blurred",
    !!mState.card &&
      // Tailwind v4 emits colours in oklab(), so accept either colour function
      // as long as the alpha channel is the 0.1 the design calls for.
      /\/\s*0?\.1\s*\)/.test(mState.card.background) &&
      /blur/.test(mState.card.backdrop ?? ""),
    `bg=${mState.card?.background} backdrop=${mState.card?.backdrop} radius=${mState.card?.radius}`,
  );
  record(
    "375px: glass card is rounded (rounded-xl = 0.875rem)",
    mState.card?.radius === "14px",
    `radius=${mState.card?.radius} (0px would mean the --radius-xl token collapsed)`,
  );
  record(
    "375px: category rail scrolls horizontally",
    mState.rail !== null && mState.rail.scrollW > mState.rail.clientW,
    `scrollW=${mState.rail?.scrollW} clientW=${mState.rail?.clientW} overflowX=${mState.rail?.overflowX}`,
  );
  record(
    "375px: 3 category cards with photos + routes",
    mState.cards.length === 3 && mState.cards.every((c) => c.imgDecoded && c.href),
    JSON.stringify(mState.cards),
  );
  record(
    "375px: card media clips the hover zoom",
    mState.mediaOverflow === "hidden",
    `overflow=${mState.mediaOverflow}`,
  );
  record(
    "375px: card image has a transform transition for hover zoom",
    !!mState.imgTransition && mState.imgTransition !== "0s",
    `transitionDuration=${mState.imgTransition}`,
  );

  // Tabs must switch without a navigation or reload.
  const before = m.url();
  let marker = 0;
  await m.evaluate(() => {
    window.__heroNoReload = true;
  });
  await m.getByRole("tab", { name: /عقارات|Properties|Immobilier/ }).click();
  await m.waitForTimeout(400);
  const after = await m.evaluate(() => ({
    url: location.href,
    markerAlive: window.__heroNoReload === true,
    selected: Array.from(document.querySelectorAll('[role="tab"]')).map(
      (b) => b.getAttribute("aria-selected"),
    ),
  }));
  record(
    "375px: tab switch keeps state (no reload)",
    after.markerAlive && after.url === before,
    `markerAlive=${after.markerAlive} urlStable=${after.url === before}`,
  );
  record(
    "375px: tab switch moves aria-selected",
    after.selected.filter((s) => s === "true").length === 1,
    JSON.stringify(after.selected),
  );

  // Screenshots land in dist/ (gitignored) so a verification run never leaves
  // artefacts in the working tree.
  await m.screenshot({ path: "dist/hero-375.png", fullPage: false });
  await m.evaluate(() => window.scrollTo(0, 0));

  // ── Desktop sanity: the same contract must not regress ──
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await desktop.newPage();
  await d.goto(BASE, { waitUntil: "load" });
  await d.waitForSelector("#hero-heading", { timeout: 30000 });
  const dState = await d.evaluate(probe);
  // Same reasoning as the 375px check; see findUnclippedOverflow.
  const desktopOverflow = await d.evaluate(findUnclippedOverflow);
  record(
    "1440px: no horizontal page overflow",
    desktopOverflow.worst === 0,
    `worst unclipped overflow=${desktopOverflow.worst}px ${JSON.stringify(desktopOverflow.offenders)} (docScrollW=${dState.docScrollW} docClientW=${dState.docClientW})`,
  );
  record(
    "1440px: H1 scales up",
    !!dState.h1 && dState.h1.fontSize > mState.h1.fontSize,
    `${dState.h1?.fontSize}px vs ${mState.h1?.fontSize}px at 375`,
  );
  record(
    "1440px: rail fits without scrolling",
    !!dState.rail && dState.rail.scrollW <= dState.rail.clientW + 1,
    `scrollW=${dState.rail?.scrollW} clientW=${dState.rail?.clientW}`,
  );
  await d.screenshot({ path: "dist/hero-1440.png", fullPage: false });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:\n" + failed.map((f) => `  - ${f.name} (${f.detail})`).join("\n"));
  process.exit(1);
}
