/**
 * DIAGNOSTIC ONLY - interactive one-off, not a gate.
 * Requires a browser and a running dev server, and its output is for a human
 * to read. Not wired into any npm script or CI workflow, and not covered by
 * tests. Do not add it to a pipeline without first rewriting it as an
 * assertion with a nonzero exit on failure.
 *
 * Shared page-side colour + geometry helpers for the visual audit scripts.
 *
 * Colours are resolved through a 1x1 canvas rather than parsed from
 * getComputedStyle: Chrome serialises computed colours as oklab() or
 * color(srgb ...) depending on how they were authored, so a regex against
 * "rgb(...)" silently reports the backdrop and turns every ratio into 1.00:1.
 */
export const PAGE_HELPERS = `
  const _cv = document.createElement('canvas');
  _cv.width = _cv.height = 1;
  const _cx = _cv.getContext('2d', { willReadFrequently: true });

  function rgba(css) {
    _cx.clearRect(0, 0, 1, 1);
    _cx.fillStyle = '#000000';
    try { _cx.fillStyle = css; } catch { return [0, 0, 0, 0]; }
    _cx.fillRect(0, 0, 1, 1);
    const d = _cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }

  function over(fg, bg) {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  }

  const luminance = ([r, g, b]) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2);
  }

  /** The colour actually painted behind el, composited down the ancestor chain. */
  function backdropOf(el) {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) {
        stack.push(c);
        if (c[3] === 1) break;
      }
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        // A gradient/image backdrop cannot be sampled; treat it as unknown and
        // keep walking so the caller still gets the nearest solid colour.
      }
      n = n.parentElement;
    }
    stack.push([255, 255, 255, 1]);
    return stack.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255, 1]);
  }

  function rectOf(el) {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height };
  }

  function overlapArea(a, b) {
    return (
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    );
  }

  /** WCAG minimum for the rendered size/weight. */
  function minRatio(fontSize, fontWeight) {
    const large = fontSize >= 24 || (fontSize >= 18.66 && Number(fontWeight) >= 700);
    return large ? 3 : 4.5;
  }

  function describe(el, s) {
    return (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
  }
`;

/** Leaves whose own background is translucent enough that text over them can fail. */
export const GLASS_SELECTOR = 'main section [class*="bg-bg-surface/"], main section [class*="/55"], main section [class*="/85"], main section [class*="/95"]';

/** Text nodes that must stay readable: leaf elements only. */
export const TEXT_SELECTOR = 'h1, h2, h3, p, label, span, button, li, a, [role="tab"], [role="option"]';
