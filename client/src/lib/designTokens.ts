/**
 * Runtime design-token resolver.
 *
 * Most components consume colour through Tailwind utility classes, which are
 * already wired to the CSS custom properties in `client/src/index.css`. A few
 * contexts cannot: Recharts hands colours to SVG *attributes* (not inline
 * styles), Mapbox wants concrete strings for marker paints, and canvas wants
 * `strokeStyle`. Attributes and canvas APIs do not evaluate `var()`, so those
 * call sites need real colour values.
 *
 * This module reads the very same custom properties off `:root` so the CSS file
 * stays the single source of truth. FALLBACKS mirror the light-theme values in
 * `index.css`; they are used during prerender (`scripts/prerender.mjs` runs
 * without a DOM) and if a token is ever renamed, so a missing token degrades to
 * the current light theme rather than to `undefined`/transparent.
 */
import { useTheme } from '@/contexts/ThemeContext';

/** Token name → light-theme value, mirroring the `:root` block in index.css. */
const FALLBACKS: Record<string, string> = {
  // brand accent
  '--accent-primary': '#1A56DB',
  '--accent-primary-h': '#1546B4',
  '--accent-primary-s': 'rgba(26, 86, 219, 0.10)',
  // surfaces + ink
  '--bg-base': '#FFFFFF',
  '--bg-surface': '#FFFFFF',
  '--bg-muted': '#F7F7F8',
  '--bg-elevated': '#FFFFFF',
  '--ink-primary': '#1C1C1E',
  '--ink-secondary': '#6E6E73',
  '--ink-tertiary': '#8A8A90',
  // borders
  '--border-subtle': '#EBEBEB',
  '--border-default': '#E0E0E4',
  '--border-strong': '#C7C7CC',
  // always-dark console panel
  '--brand-panel': '#123A93',
  '--brand-panel-2': '#0B2E6F',
  '--brand-panel-ink': '#FFFFFF',
  '--brand-panel-ink-2': 'rgba(255, 255, 255, 0.72)',
  '--brand-panel-line': 'rgba(255, 255, 255, 0.16)',
  // always-dark navy ramp, used for dense map clusters
  '--brand-navy': '#0B1220',
  '--brand-navy-deep': '#060A12',
  // semantic
  '--accent-green': '#059669',
  '--accent-red': '#DC2626',
  '--accent-amber': '#B45309',
  '--accent-warm': '#B7791F',
};

const cache = new Map<string, string>();

/**
 * Resolve a CSS custom property to a concrete colour string.
 *
 * @param name  Custom property name, including the leading `--`.
 * @param root  Optional element to read from (defaults to `document.documentElement`).
 * @returns The computed value, or the light-theme fallback when there is no DOM
 *          (SSR/prerender) or the token is unknown.
 */
export function token(name: string, root?: HTMLElement | null): string {
  const fallback = FALLBACKS[name] ?? 'currentColor';
  if (typeof document === 'undefined') return fallback;

  const el = root ?? document.documentElement;
  const key = `${name}@${el.classList.contains('dark') ? 'dark' : 'light'}`;

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let value = '';
  try {
    value = getComputedStyle(el).getPropertyValue(name).trim();
  } catch {
    value = '';
  }
  const resolved = value || fallback;
  cache.set(key, resolved);
  return resolved;
}

/**
 * Drop the memoised values. Call this after a theme flip so charts and map
 * layers repaint with the new palette.
 */
export function resetTokenCache(): void {
  cache.clear();
}

/**
 * Reactive variant of {@link token} for components that must repaint when the
 * theme flips (Recharts series, Mapbox paints). Re-reads the token on every
 * theme change so a dark-mode toggle never leaves a stale light-mode colour
 * baked into an SVG attribute.
 *
 * Must be called inside a component tree wrapped in `ThemeProvider`.
 *
 * @example
 * const accent = useToken('--accent-primary');
 * <Area stroke={accent} />
 */
export function useToken(name: string): string {
  const { theme } = useTheme();
  // `theme` is the dependency that matters: it re-runs the read after a flip,
  // by which point the `.dark` class is already on <html>.
  void theme;
  return token(name);
}
