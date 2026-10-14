#!/usr/bin/env node
/**
 * Heap-growth probe for the favorites / optimistic-UI flow — Phase C
 * finalization (STEP 3).
 *
 * What it does
 * ------------
 * Drives a real Chromium through `ITERATIONS` cycles of List → Detail → Back
 * and samples the renderer JS heap through the Chrome DevTools Protocol, forcing
 * a full GC before each sample so the reading reflects retained objects rather
 * than uncollected garbage. `usedSize` growth above `GROWTH_BUDGET_MB` is
 * reported as a BUG and exits non-zero.
 *
 * § Why the detail route is `/property/:id`
 * The step's brief named a `ListingDetailsPage`. That page does not exist in
 * this codebase; the listing detail route is `/property/:id`, rendered by
 * `client/src/pages/PropertyDetailWithVideo.tsx` (see `client/src/App.tsx`).
 * Override with DETAIL_PATH if that changes.
 *
 * Safety guards (the script is a no-op without a dev server)
 * ---------------------------------------------------------
 * - Skips cleanly when `DEV_SERVER_URL` (or `BASE_URL`) is unset.
 * - Refuses any non-local target unless `--allow-remote` is passed.
 * - Never touches the database or any authenticated route.
 *
 * Usage
 * -----
 *   pnpm dev                                  # in one shell (serves :3000)
 *   DEV_SERVER_URL=http://localhost:3000 node scripts/verify-favorites-heap.mjs
 *
 * Env knobs: ITERATIONS (20), GROWTH_BUDGET_MB (5), LIST_PATH (/),
 * DETAIL_PATH (/property/1).
 */
import { chromium } from "playwright";

const BASE_URL = process.env.DEV_SERVER_URL ?? process.env.BASE_URL ?? "";
const LIST_PATH = process.env.LIST_PATH ?? "/";
const DETAIL_PATH = process.env.DETAIL_PATH ?? "/property/1";
const ITERATIONS = Number(process.env.ITERATIONS ?? 20);
const GROWTH_BUDGET_MB = Number(process.env.GROWTH_BUDGET_MB ?? 5);
const ALLOW_REMOTE = process.argv.includes("--allow-remote");

/** A localhost target is the only one we probe by default. */
function isLocalTarget(url) {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

const toMb = (bytes) => bytes / (1024 * 1024);

async function main() {
  if (!BASE_URL) {
    console.log("• DEV_SERVER_URL is not set — skipping the heap probe (no-op).");
    console.log("  Start the app, then:");
    console.log("    DEV_SERVER_URL=http://localhost:3000 node scripts/verify-favorites-heap.mjs");
    return;
  }

  if (!isLocalTarget(BASE_URL) && !ALLOW_REMOTE) {
    console.error(`✗ refusing to probe the non-local target ${BASE_URL}.`);
    console.error("  Re-run with --allow-remote to confirm you intend to probe it.");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    const collectGarbage = () => cdp.send("HeapProfiler.collectGarbage");
    const heapUsedBytes = async () => {
      const { usedSize } = await cdp.send("Runtime.getHeapUsage");
      return usedSize;
    };
    /** Full GC, then read the heap so the sample excludes uncollected garbage. */
    const sampleHeap = async () => {
      await collectGarbage();
      return heapUsedBytes();
    };

    /** One List → Detail → Back cycle. */
    async function cycle() {
      await page.goto(`${BASE_URL}${LIST_PATH}`, { waitUntil: "networkidle" });
      const card = page.locator('[role="link"][aria-label]').first();
      if ((await card.count()) > 0) {
        await card.click();
      } else {
        // Empty list (or no cards rendered): navigate the detail route directly
        // so the page component still mounts and unmounts.
        await page.goto(`${BASE_URL}${DETAIL_PATH}`, { waitUntil: "networkidle" });
      }
      await page.waitForTimeout(300); // let lazy chunks + queries settle
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(150);
    }

    // Warm-up (unrelated): compile lazy chunks and prime caches so the baseline
    // is not polluted by one-off module/JIT allocation.
    for (let i = 0; i < 3; i++) await cycle();

    const baseline = await sampleHeap();
    let peak = baseline;
    const samples = [];

    for (let i = 1; i <= ITERATIONS; i++) {
      await cycle();
      const used = await sampleHeap();
      peak = Math.max(peak, used);
      samples.push(used);
      if (i % 5 === 0 || i === ITERATIONS) {
        console.log(
          `  cycle ${String(i).padStart(2)}/${ITERATIONS}  heap=${toMb(used).toFixed(2)}MB  growth=${toMb(used - baseline).toFixed(2)}MB`,
        );
      }
    }

    const growthMb = toMb(peak - baseline);
    console.log("");
    console.log(
      `✓ ${ITERATIONS} cycles | baseline=${toMb(baseline).toFixed(2)}MB peak=${toMb(peak).toFixed(2)}MB growth=${growthMb.toFixed(2)}MB (budget ${GROWTH_BUDGET_MB}MB)`,
    );

    if (growthMb > GROWTH_BUDGET_MB) {
      console.error(
        `✗ BUG: heap grew ${growthMb.toFixed(2)}MB over ${ITERATIONS} List→Detail→Back cycles, over the ${GROWTH_BUDGET_MB}MB budget.`,
      );
      console.error("  Look for subscriptions/timers/observers not torn down on unmount, or unbounded React Query cache growth.");
      process.exitCode = 1;
    } else {
      console.log("  No leak flagged within budget.");
    }
  } finally {
    await browser.close();
  }
}

await main();
