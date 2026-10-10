/**
 * Provider-agnostic conversion tracking.
 *
 * Events are fire-and-forget on purpose: `trackEvent` never awaits, never
 * throws and never blocks the booking funnel. When the consent-gated GA4
 * provider is present (`window.gtag`, installed by `ConsentAnalytics` after
 * legal consent) events are forwarded there; otherwise they fall back to a
 * console stub in development so the taxonomy stays observable without a
 * network dependency.
 */

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

function isDev(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.DEV);
  } catch {
    return false;
  }
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    // Drop empty values so the payload stays clean and identical across
    // providers (GA4 rejects `null`/`undefined`).
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
    );
    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag === "function") {
      gtag("event", eventName, clean);
      return;
    }
    if (isDev()) {
      console.debug("[analytics]", eventName, clean);
    }
  } catch {
    // Analytics must never break the funnel.
  }
}
