/**
 * Map interaction suite: cluster -> expansion zoom -> popup -> navigation.
 *
 * Runs the real production build in Chromium with 56 synthetic listings
 * (cars + properties across Casablanca/Rabat/Marrakech/Agadir/Tangier)
 * injected in place of the `listings.search` tRPC response. Nothing is stubbed
 * inside the app: the actual MapboxSearchMap component, GeoJSON clustering,
 * getClusterExpansionZoom, popup construction and routing all run for real.
 *
 * Requires a build made with the test hook enabled, because Mapbox paints to a
 * canvas and cluster state is otherwise unobservable from the DOM:
 *   $env:VITE_MAP_TEST_HOOK='1'; pnpm build
 *   pnpm start
 *   node scripts/verify-map-interactions.mjs
 */
import { chromium } from "playwright";
import {
  buildMapFixtures,
  tRPCSearchBody,
  findMisclassifiedFixtures,
} from "./seed-map-fixtures.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const fixtures = buildMapFixtures();
const carCount = fixtures.filter((f) => /سيارة|car/.test(f.category)).length;
const propertyCount = fixtures.length - carCount;
console.log(
  `fixtures: ${fixtures.length} listings (${carCount} car / ${propertyCount} property) across 5 cities\n`,
);

// Pre-flight: a fixture whose category the app classifies differently from its
// intent would make every type-aware-routing assertion below meaningless — the
// route would be right by accident, or wrong for reasons outside the map.
const misclassified = findMisclassifiedFixtures();
record(
  "fixture categories classify as intended",
  misclassified.length === 0,
  misclassified.length
    ? `${misclassified.length} mismatched, e.g. id=${misclassified[0].id} "${misclassified[0].category}" -> ${misclassified[0].isCar ? "car" : "property"}`
    : `${fixtures.length} fixtures verified against categories.ts`,
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

// --- fixture injection -------------------------------------------------------
let injected = 0;
await page.route(/\/api\/trpc\/listings\.search/, async (route) => {
  injected += 1;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: tRPCSearchBody(fixtures),
  });
});

await page.goto(`${BASE_URL}/search`, { waitUntil: "networkidle" });
await page.waitForSelector("header", { timeout: 20000 });

// --- switch to map view ------------------------------------------------------
await page.locator("button:has(svg.lucide-map)").first().click();
await page.waitForSelector("canvas.mapboxgl-canvas", { timeout: 25000 });
await page.waitForFunction(() => Boolean(window.__altusMap), null, { timeout: 25000 });
await page.waitForFunction(
  () => window.__altusMap?.isStyleLoaded?.() === true,
  null,
  { timeout: 25000 },
);
record("test hook exposed + style loaded", true, `injected=${injected}`);

// Wait for the source to actually carry the fixtures.
// `_data` is a mapbox-gl internal (the raw GeoJSON handed to setData); it is the
// only way to assert the payload arrived without panning the map to every city.
await page.waitForFunction(
  () => {
    const src = window.__altusMap?.getSource?.("listing-points");
    return Boolean(src?._data?.features?.length);
  },
  null,
  { timeout: 25000 },
);

const sourceCount = await page.evaluate(
  () => window.__altusMap.getSource("listing-points")._data.features.length,
);
record("fixtures reached the GeoJSON source", sourceCount === fixtures.length, `${sourceCount} features`);

const clusterCfg = await page.evaluate(() => {
  const s = window.__altusMap.getSource("listing-points");
  return { cluster: s._options.cluster, maxZoom: s._options.clusterMaxZoom, radius: s._options.clusterRadius };
});
record(
  "source is clustered",
  clusterCfg.cluster === true,
  `cluster=${clusterCfg.cluster} maxZoom=${clusterCfg.maxZoom} radius=${clusterCfg.radius}`,
);

/**
 * Counts features per layer currently rendered in the viewport.
 * No bbox is passed: the default query is the whole viewport, which is the
 * region of interest, and Mapbox's `bbox` option expects screen-space points
 * rather than [west, south, east, north].
 */
const renderedCounts = () =>
  page.evaluate(() => {
    const m = window.__altusMap;
    const count = (layer) => {
      if (!m.getLayer(layer)) return -1;
      return m.queryRenderedFeatures({ layers: [layer] }).length;
    };
    return {
      clusters: count("clusters"),
      clusterCount: count("cluster-count"),
      unclustered: count("unclustered-point"),
      zoom: m.getZoom(),
    };
  });

// --- country-level view should cluster --------------------------------------
// NOTE: queryRenderedFeatures only reports what is inside the viewport, so the
// rendered totals below are deliberately NOT compared against the 56 fixtures —
// at z7 only the Casablanca and Rabat clusters are on screen. Source-level
// completeness is asserted separately above.
await page.waitForTimeout(1500);
const zoomedOut = await renderedCounts();
record(
  "country view clusters points",
  zoomedOut.clusters > 0 && zoomedOut.unclustered === 0,
  `${zoomedOut.clusters} clusters + ${zoomedOut.unclustered} individual at z${zoomedOut.zoom.toFixed(2)}`,
);

/**
 * Scrolls the map into the viewport and waits for the scroll to settle.
 *
 * Required before synthesising clicks: the map renders well below the fold
 * (canvas top ~998px in a 950px viewport), so `project()` coordinates land
 * outside the viewport and both elementFromPoint and mouse.click silently do
 * nothing. Returns nothing; call before computing any click coordinates.
 */
async function scrollMapIntoView() {
  await page.evaluate(() => {
    window.__altusMap.getCanvas().scrollIntoView({ block: "center", behavior: "instant" });
  });
  await page.waitForTimeout(600);
  // Fail loudly rather than producing out-of-viewport coordinates again.
  const rect = await page.evaluate(() => {
    const r = window.__altusMap.getCanvas().getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: r.height };
  });
  if (rect.top < 0 || rect.bottom > 950 + 1) {
    throw new Error(
      `map still not fully in view after scroll (top=${rect.top}, bottom=${rect.bottom})`,
    );
  }
}

// --- click a cluster: expect expansion zoom + children -----------------------
// Centre on Casablanca first so the target sits mid-canvas rather than under
// the sticky header.
await page.evaluate(() => {
  window.__altusMap.jumpTo({ center: [-7.5898, 33.5731], zoom: 10 });
});
await page.waitForTimeout(2000);
await scrollMapIntoView();

const clicked = await page.evaluate(() => {
  const m = window.__altusMap;
  const rect = m.getCanvas().getBoundingClientRect();
  const feats = m.queryRenderedFeatures({ layers: ["clusters"] });
  if (!feats.length) return { ok: false, reason: "no cluster features in view" };
  // Largest cluster first, but only accept one that is actually clickable:
  // the sticky header is a DOM element over the canvas, and a cluster
  // projecting near the top would have its click swallowed by it.
  const bySize = feats.slice().sort(
    (a, b) => (b.properties?.point_count ?? 0) - (a.properties?.point_count ?? 0),
  );
  const margin = 24;
  let firstCovered = null;
  for (const f of bySize) {
    const pt = m.project(f.geometry.coordinates);
    const x = rect.left + pt.x;
    const y = rect.top + pt.y;
    if (!(x > rect.left + margin && x < rect.right - margin && y > rect.top + margin && y < rect.bottom - margin)) continue;
    const topEl = document.elementFromPoint(x, y);
    if (topEl?.classList?.contains?.("mapboxgl-canvas")) {
      return {
        ok: true,
        zoomBefore: m.getZoom(),
        pointCount: f.properties?.point_count,
        x,
        y,
        hitCanvas: true,
        hitTag: topEl.tagName,
      };
    }
    if (!firstCovered) {
      firstCovered = { tag: topEl?.tagName ?? "null", cls: String(topEl?.className ?? "").slice(0, 50) };
    }
  }
  return { ok: false, reason: `every cluster was occluded (first blocker: ${firstCovered?.tag}.${firstCovered?.cls})` };
});
record(
  "found a cluster to click",
  clicked.ok,
  clicked.ok ? `point_count=${clicked.pointCount} hit=${clicked.hitTag}` : clicked.reason,
);
record("cluster click target is not covered", clicked.ok, clicked.ok ? `topmost=${clicked.hitTag}` : "n/a");

let afterCounts = null;
if (clicked.ok) {
  await page.mouse.click(clicked.x, clicked.y);
  // Poll rather than sleep: after an expansion zoom the map re-tiles, and a
  // fixed wait can sample the viewport mid-render and report zero features.
  await page.waitForFunction(
    () => {
      const m = window.__altusMap;
      if (!m) return false;
      return (
        m.queryRenderedFeatures({ layers: ["clusters"] }).length +
          m.queryRenderedFeatures({ layers: ["unclustered-point"] }).length >
        0
      );
    },
    null,
    { timeout: 15000 },
  ).catch(() => {});
  const afterZoom = await page.evaluate(() => window.__altusMap.getZoom());
  afterCounts = await renderedCounts();
  record(
    "cluster click zooms in",
    afterZoom > clicked.zoomBefore,
    `z${clicked.zoomBefore.toFixed(2)} -> z${afterZoom.toFixed(2)}`,
  );
  record(
    "cluster expansion reveals children",
    afterCounts.clusters + afterCounts.unclustered > 0,
    `${afterCounts.clusters} clusters + ${afterCounts.unclustered} individual after click`,
  );
}

// --- density stress: a tight blob must stay collapsed while it is dense -----
// Must run while the map is still mounted, i.e. BEFORE the navigation step
// below, which unmounts the search page and destroys the map.
const density = await page.evaluate(() => {
  const m = window.__altusMap;
  const counts = m
    .queryRenderedFeatures({ layers: ["clusters"] })
    .map((f) => Number(f.properties?.point_count ?? 0))
    .sort((a, b) => b - a);
  return { largest: counts[0] ?? 0, clusterCount: counts.length };
});
record(
  "dense city collapses into a large cluster",
  density.largest >= 10,
  `largest cluster holds ${density.largest} points across ${density.clusterCount} clusters`,
);

// --- click an individual point: expect a popup preview ----------------------
// The cluster click above should have dissolved Casablanca's blob into
// individual pins. If it did not, zoom past clusterMaxZoom so the assertion
// below tests the popup rather than the zoom.
if (afterCounts && afterCounts.unclustered === 0) {
  await page.evaluate(() => window.__altusMap.jumpTo({ center: [-7.5898, 33.5731], zoom: 14 }));
  await page.waitForTimeout(2000);
}
await scrollMapIntoView();

/**
 * Clicks the first rendered individual point of the given type, checks the
 * popup preview, then follows its CTA and reports the resulting path.
 *
 * Run once per type. The original defect was a car-only marker route, so
 * proving only one direction would leave half the regression uncovered.
 */
async function exercisePointOfType(type) {
  const opened = await page.evaluate((wanted) => {
    const m = window.__altusMap;
    const rect = m.getCanvas().getBoundingClientRect();
    const feats = m
      .queryRenderedFeatures({ layers: ["unclustered-point"] })
      .filter((f) => (f.properties?.type ?? "property") === wanted);
    if (!feats.length) return { ok: false, reason: `no "${wanted}" points rendered` };

    // Not every rendered point is clickable: the sticky header is a DOM
    // element laid over the top of the map, so a pin projecting near the canvas
    // top has a DIV on top of it and the click is swallowed. Scan for the first
    // point whose topmost element really is the canvas, with a small margin so
    // the pin is not on the very edge of the map.
    const margin = 24;
    let firstCovered = null;
    for (const f of feats) {
      const pt = m.project(f.geometry.coordinates);
      const x = rect.left + pt.x;
      const y = rect.top + pt.y;
      const inside =
        x > rect.left + margin && x < rect.right - margin &&
        y > rect.top + margin && y < rect.bottom - margin;
      if (!inside) continue;
      const topEl = document.elementFromPoint(x, y);
      if (topEl?.classList?.contains?.("mapboxgl-canvas")) {
        return {
          ok: true,
          x,
          y,
          // Feature properties are only { id, type } — the title lives in the
          // popup, so it is resolved from the fixture by id, not the feature.
          id: f.properties?.id,
          type: f.properties?.type,
          hitCanvas: true,
          hitTag: topEl.tagName,
        };
      }
      if (!firstCovered) {
        firstCovered = { tag: topEl?.tagName ?? "null", cls: String(topEl?.className ?? "").slice(0, 50) };
      }
    }
    return {
      ok: false,
      reason: `every "${wanted}" point was occluded (first blocker: ${firstCovered?.tag}.${firstCovered?.cls})`,
    };
  }, type);
  record(
    `found an individual "${type}" point`,
    opened.ok,
    opened.ok ? `id=${opened.id} topmost=${opened.hitTag}` : opened.reason,
  );
  record(
    `"${type}" click target is not covered`,
    opened.ok,
    opened.ok ? `topmost=${opened.hitTag}` : "n/a",
  );
  if (!opened.ok) return { navigated: null };

  const expectedFixture = fixtures.find((f) => String(f.id) === String(opened.id));
  await page.mouse.click(opened.x, opened.y);
  await page.waitForSelector(".mapboxgl-popup", { timeout: 10000 });
  await page.waitForTimeout(600);
  const popup = await page.evaluate(() => {
    const p = document.querySelector(".mapboxgl-popup");
    if (!p) return null;
    return {
      text: p.textContent.replace(/\s+/g, " ").trim(),
      hasButton: Boolean([...p.querySelectorAll("button")].find((b) => b.textContent.trim() === "عرض")),
      buttonCount: p.querySelectorAll("button").length,
    };
  });
  record(`popup opens on "${type}" point click`, Boolean(popup), popup ? popup.text.slice(0, 80) : "no popup");
  record(
    `popup preview card has a CTA ("${type}")`,
    Boolean(popup?.hasButton),
    popup ? `${popup.buttonCount} buttons` : "",
  );
  // Arabic is RTL and the popup concatenates without separators, so compare a
  // short prefix rather than the whole string.
  const titlePrefix = String(expectedFixture?.title ?? "").slice(0, 10);
  record(
    `popup shows the listing title ("${type}")`,
    Boolean(popup && titlePrefix && popup.text.includes(titlePrefix)),
    `expected prefix "${titlePrefix}"`,
  );
  record(
    `popup shows the city ("${type}")`,
    Boolean(popup && expectedFixture && popup.text.includes(expectedFixture.city)),
    `expected "${expectedFixture?.city}"`,
  );
  record(
    `popup shows the price ("${type}")`,
    Boolean(popup && expectedFixture && popup.text.includes(String(expectedFixture.pricePerDay))),
    `expected ${expectedFixture?.pricePerDay}`,
  );

  const expected = type === "property" ? "/property/" : "/car/";
  await page.locator(".mapboxgl-popup button", { hasText: "عرض" }).first().click();
  await page.waitForURL(new RegExp(expected.replace("/", "\\/")), { timeout: 15000 });
  const path = page.url().replace(BASE_URL, "");
  record(
    `popup CTA navigates with type-aware route ("${type}")`,
    path.includes(expected),
    `${path} (expected ${expected})`,
  );
  return { navigated: path };
}

const propertyRun = await exercisePointOfType("property");

// Navigating away unmounts the search page and destroys the map, so re-enter
// map view before exercising the car path. `networkidle` is not used here:
// Mapbox holds long-lived tile/telemetry requests open, so the network never
// goes idle and the wait fails with ERR_NETWORK_IO_SUSPENDED.
if (propertyRun.navigated) {
  await page.goto(`${BASE_URL}/search`, { waitUntil: "domcontentloaded" });
  await page.locator("button:has(svg.lucide-map)").first().click({ timeout: 25000 });
  await page.waitForSelector("canvas.mapboxgl-canvas", { timeout: 25000 });
  await page.waitForFunction(
    () => Boolean(window.__altusMap) && window.__altusMap.isStyleLoaded(),
    null,
    { timeout: 25000 },
  );
  // Zoom in BEFORE waiting for individual pins: the map re-enters at the
  // country centre where every point is clustered, so waiting for
  // unclustered-point first would block forever.
  await page.evaluate(() => window.__altusMap.jumpTo({ center: [-7.5898, 33.5731], zoom: 14 }));
  await page.waitForFunction(
    () => {
      const m = window.__altusMap;
      return m.queryRenderedFeatures({ layers: ["unclustered-point"] }).length > 0;
    },
    null,
    { timeout: 25000 },
  );
  await page.waitForTimeout(1200);
  await scrollMapIntoView();
  await exercisePointOfType("car");
}

// --- error hygiene ----------------------------------------------------------
const realErrors = consoleErrors.filter(
  (e) => !/429|TRPCClientError|Too Many Requests|Failed to load resource/.test(e),
);
record("no unexpected console/page errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | ") || "clean");

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
