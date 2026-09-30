import { useRouteAnnouncer } from "@/hooks/useRouteAnnouncer";

/**
 * Renders the polite live regions that announce the new page after a
 * client-side navigation, and drives focus management as a side effect of the
 * hook.
 *
 * Both regions must be present from the first paint and must never unmount:
 * a live region added to the DOM in the same tick as its content is not
 * announced by most screen readers. Keep this component mounted for the
 * lifetime of the app (it is rendered unconditionally in App.tsx).
 */
export function RouteAnnouncer() {
  const { first, second } = useRouteAnnouncer();
  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {first}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {second}
      </div>
    </>
  );
}