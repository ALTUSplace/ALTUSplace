import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePersistFn } from "@/hooks/usePersistFn";
import {
  normalizeAnnouncement,
  pageNameFromTitle,
  toComparablePath,
} from "@/lib/routeAnnouncement";

/**
 * Id of the `<main>` landmark rendered in App.tsx. It doubles as the skip-link
 * target and as the focus fallback for pages that expose no `<h1>`.
 */
export const MAIN_CONTENT_ID = "main-content";

/**
 * `PageTransition` (client/src/components/PageTransition.tsx) swaps the page
 * for a skeleton for 250ms on every navigation, and lazy routes resolve their
 * chunk asynchronously on top of that, so the destination heading is normally
 * absent from the DOM for several frames after the location changes. Polling
 * until it appears is the difference between focus management that works and
 * focus management that silently no-ops on every single navigation.
 */
const HEADING_POLL_INTERVAL_MS = 50;
const HEADING_WAIT_BUDGET_MS = 1_500;

/**
 * Radix overlays and native `<dialog>` trap focus. Moving focus to a heading
 * outside the trap would not just be surprising, it would leave the modal
 * permanently broken with focus stranded behind it.
 */
const FOCUS_TRAP_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog[open]';

/**
 * The two live-region texts, alternating on each navigation.
 *
 * Two regions rather than one because assistive tech only speaks a live region
 * whose text actually *changed*: with one region, Home -> Search -> Home would
 * announce the first two pages and silently drop the third.
 */
export interface RouteAnnouncement {
  readonly first: string;
  readonly second: string;
}

/**
 * Picks the element that should receive focus for the page now on screen:
 * its `<h1>` when one is rendered and visible, otherwise the `<main>` landmark.
 *
 * The fallback is load-bearing rather than belt-and-braces — Checkout.tsx has
 * no `<h1>` at all, and most detail pages only render one after their data
 * resolves.
 */
function findFocusTarget(doc: Document): HTMLElement | null {
  const main = doc.getElementById(MAIN_CONTENT_ID);
  if (!main) return null;
  const heading = main.querySelector<HTMLElement>("h1");
  // `getClientRects()` is empty inside `display: none` subtrees and under the
  // `sr-only` utility, both of which would make this a bad focus target.
  if (heading && heading.getClientRects().length > 0) return heading;
  return main;
}

function moveFocus(doc: Document, target: HTMLElement): void {
  const active = doc.activeElement;
  if (active instanceof Element && active.closest(FOCUS_TRAP_SELECTOR)) return;
  // `<h1>` and `<main>` are not focusable by default. `tabindex="-1"` keeps them
  // out of the tab sequence while making them programmatically focusable.
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  // Deliberately not preventScroll: focusing the new page's heading is also
  // what performs the scroll-to-top that a full page load would have given us.
  target.focus();
}

/**
 * Fires on every route change to (a) publish the new page's name to an
 * `aria-live="polite"` region and (b) move focus to that page.
 *
 * Announcement text is returned rather than written to the DOM directly so the
 * regions stay ordinary React state; rendering them is RouteAnnouncer's job.
 *
 * Resolution order for the page name: rendered `<h1>` -> `document.title`
 * (already localised per page by `useSEO`) -> a generic localised fallback.
 */
export function useRouteAnnouncer(): RouteAnnouncement {
  const [path] = useLocation();
  const { t } = useLanguage();
  const [announcement, setAnnouncement] = useState<RouteAnnouncement>({ first: "", second: "" });

  const isFirstRender = useRef(true);
  const lastPath = useRef<string | null>(null);
  const nextSlot = useRef(0);
  // `t` is rebuilt on every LanguageProvider render, so pinning it keeps the
  // effect keyed on the route alone.
  const translate = usePersistFn(t);

  const comparablePath = toComparablePath(path);

  useEffect(() => {
    if (typeof document === "undefined") return;

    // Moving focus on mount would fight the browser's own initial focus target
    // and, on a reload, re-announce the page the user just asked for. Screen
    // readers already read the document as it loads.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastPath.current = comparablePath;
      return;
    }

    // A trailing-slash variant changes the string wouter reports without
    // changing the page; that is not a page change and must stay silent.
    if (lastPath.current === comparablePath) return;
    lastPath.current = comparablePath;

    let cancelled = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (target: HTMLElement | null) => {
      if (settled || cancelled) return;
      settled = true;
      const message =
        (target?.tagName === "H1" ? normalizeAnnouncement(target.textContent) : "") ||
        pageNameFromTitle(docTitle()) ||
        normalizeAnnouncement(translate("pageAnnouncementGeneric"));
      if (message) {
        const slot = nextSlot.current % 2;
        nextSlot.current += 1;
        setAnnouncement((current) =>
          slot === 0 ? { first: message, second: current.second } : { first: current.first, second: message },
        );
      }
      if (target) moveFocus(document, target);
    };

    const startedAt = Date.now();
    const poll = () => {
      if (cancelled || settled) return;
      // A hidden tab would burn the whole budget announcing into the void, and
      // focusing on return is not what the user is waiting for. Settle instead
      // as soon as they come back.
      if (document.visibilityState === "hidden") return;
      const target = findFocusTarget(document);
      const headingReady = target?.tagName === "H1";
      if (headingReady || Date.now() - startedAt >= HEADING_WAIT_BUDGET_MS) {
        settle(target);
        return;
      }
      timer = setTimeout(poll, HEADING_POLL_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") settle(findFocusTarget(document));
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    poll();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [comparablePath, translate]);

  return announcement;
}

/** Indirection so the title lookup stays swappable in tests. */
function docTitle(): string {
  return typeof document === "undefined" ? "" : document.title;
}