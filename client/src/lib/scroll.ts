/**
 * Smooth-scrolls the window back to the top of the page.
 *
 * Shared by the navbar city pickers (desktop listbox + mobile accordion) so
 * choosing a city always returns the user to the top of the /search page
 * instead of stranding them at the previous offset: the pickers hang off a
 * sticky navbar and stay reachable from deep inside the results list.
 *
 * Deferred by two animation frames on purpose:
 *  1. The click handler runs before React commits the router's re-render, so an
 *     immediate scroll would measure the pre-navigation layout.
 *  2. On mobile the picker lives inside the navbar overlay, which locks
 *     `document.body` with `overflow: hidden` and only releases it in an effect
 *     after the menu closes. A scroll issued in the same tick is dropped.
 */
export function scrollToPageTop(): void {
  if (typeof window === "undefined") return;
  // index.css:283 already sets `html { scroll-behavior: smooth }` globally and
  // flips it to `auto` under `prefers-reduced-motion`, so a plain
  // `window.scrollTo(0, 0)` would already behave correctly. Spelled out here
  // anyway so this call does not silently depend on a stylesheet rule that
  // lives two directories away.
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const run = () =>
    window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? "auto" : "smooth" });

  if (typeof window.requestAnimationFrame !== "function") {
    run();
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run);
  });
}
