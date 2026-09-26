/**
 * WCAG contrast guardrail for the design tokens.
 *
 * Why this exists: `#3B82F6` (Tailwind blue-500) was hardcoded into the admin
 * pages as brand blue. On white it is 3.68:1 — below the 4.5:1 AA threshold for
 * body text — and it shipped, because nothing in the suite looked at colour.
 * The brand-blue harmonisation pass replaced it with the `--accent-primary`
 * token; this test is what stops the next stray hex from doing the same thing.
 *
 * The test parses `client/src/index.css` directly rather than importing a token
 * module, so editing a hex in the stylesheet without considering its pairing
 * fails here. Both themes are covered, because the light and dark blocks are
 * independent declarations of the same variable names.
 */
import { readFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const CLIENT_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/src');
const css = readFileSync(resolve(CLIENT_SRC, 'index.css'), 'utf8');

/** Slice out the `:root { … }` and `.dark { … }` blocks from the stylesheet. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Block ${selector} not found`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`Unterminated block ${selector}`);
}

/** Extract a `--name: value;` declaration from inside a specific block. */
function tokenIn(source: string, name: string): string {
  const m = source.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`Token ${name} not found`);
  return m[1].trim();
}

/**
 * Follow `var(--other)` indirections so a token that is defined as an alias
 * (`--color-primary-foreground: var(--primary-ink)`) can still be asserted on.
 * The reference must resolve within the same block, which is what the cascade
 * guarantees for these theme-scoped tokens.
 */
function resolveIn(source: string, name: string, seen = new Set<string>()): string {
  const value = tokenIn(source, name);
  const ref = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!ref) return value;
  if (seen.has(ref[1])) throw new Error(`Circular token reference: ${[...seen, ref[1]].join(' → ')}`);
  seen.add(name);
  return resolveIn(source, ref[1], seen);
}

/** Parse #RGB, #RRGGBB or rgb()/rgba() into 8-bit channels. */
function parseColor(color: string): [number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unsupported colour syntax: ${color}`);
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2]];
}

/** Relative luminance per WCAG 2.1. */
function luminance(color: string): number {
  const [r, g, b] = parseColor(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio. Alpha is ignored; all asserted pairings are opaque. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root');
const dark = block('.dark');

type Pair = [label: string, fg: string, bg: string];
type Scope = { name: string; source: string; min: number };

/** Body text: WCAG AA normal text, 4.5:1. */
const AA_TEXT: Pair[] = [
  ['body ink on base surface', '--ink-primary', '--bg-base'],
  ['body ink on muted surface', '--ink-primary', '--bg-muted'],
  ['body ink on elevated surface', '--ink-primary', '--bg-elevated'],
  ['secondary ink on base surface', '--ink-secondary', '--bg-base'],
  ['secondary ink on muted surface', '--ink-secondary', '--bg-muted'],
  ['brand accent on base surface (links)', '--accent-primary', '--bg-base'],
  ['brand accent on muted surface', '--accent-primary', '--bg-muted'],
  ['destructive on base surface', '--accent-red', '--bg-base'],
  ['warning on base surface', '--accent-amber', '--bg-base'],
];

/** Large text / icons / borders: the 3:1 non-text minimum. */
const AA_LARGE: Pair[] = [
  ['tertiary ink on base surface', '--ink-tertiary', '--bg-base'],
  ['tertiary ink on muted surface', '--ink-tertiary', '--bg-muted'],
  ['brand accent on elevated surface', '--accent-primary', '--bg-elevated'],
];

/**
 * The always-dark console panel is deliberately theme-independent — it carries
 * white text in both themes, so its contrast must hold in both.
 */
const PANEL: Pair[] = [
  ['panel ink on panel', '--brand-panel-ink', '--brand-panel'],
  ['panel muted ink on panel', '--brand-panel-ink-2', '--brand-panel'],
  ['panel ink on panel gradient stop', '--brand-panel-ink', '--brand-panel-2'],
];

function assertPairs(scope: Scope, pairs: Pair[]) {
  for (const [label, fg, bg] of pairs) {
    it(`${label} (${scope.min}:1)`, () => {
      const fgVal = tokenIn(scope.source, fg);
      const bgVal = tokenIn(scope.source, bg);
      const ratio = contrast(fgVal, bgVal);
      expect(
        ratio,
        `${label} — ${fgVal} on ${bgVal} is ${ratio.toFixed(2)}:1, below the ${scope.min}:1 minimum`,
      ).toBeGreaterThanOrEqual(scope.min);
    });
  }
}

describe('contrast — light theme', () => {
  assertPairs({ name: 'light', source: light, min: 4.5 }, AA_TEXT);
  assertPairs({ name: 'light', source: light, min: 3 }, AA_LARGE);
});

describe('contrast — dark theme', () => {
  assertPairs({ name: 'dark', source: dark, min: 4.5 }, AA_TEXT);
  assertPairs({ name: 'dark', source: dark, min: 3 }, AA_LARGE);
});

describe('contrast — always-dark brand panel (theme-independent)', () => {
  assertPairs({ name: 'panel', source: light, min: 4.5 }, PANEL);
});

describe('primary button fill carries its own foreground', () => {
  it('--color-primary-foreground tracks the theme rather than hardcoding white', () => {
    // The bug this guards: `--color-primary-foreground` used to be a literal
    // #FFFFFF. That is correct on the light accent (#1A56DB, 6.18:1) but fails
    // on the brighter dark accent (#4F86F7, 3.45:1), so every dark-mode CTA
    // shipped below AA. Both aliases must resolve through --primary-ink.
    for (const alias of ['--color-primary-foreground', '--color-sidebar-primary-foreground']) {
      const decl = css.match(new RegExp(`${alias}\\s*:\\s*([^;]+);`));
      expect(decl, `${alias} not found in @theme`).toBeTruthy();
      expect(decl![1].trim(), `${alias} must be var(--primary-ink)`).toBe('var(--primary-ink)');
    }
  });

  it('accent fill + its ink clear AA in both themes', () => {
    for (const [name, source] of [['light', light], ['dark', dark]] as const) {
      const ink = resolveIn(source, '--primary-ink');
      const fill = tokenIn(source, '--accent-primary');
      const ratio = contrast(ink, fill);
      expect(
        ratio,
        `${name}: primary button ${ink} on ${fill} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('stray brand hexes are not reintroduced', () => {
  // These ad-hoc values were the source of the "several shades of blue" problem.
  // Reintroducing one in a component is invisible to a typecheck, so pin them.
  const BANNED = ['#3B82F6', '#2563EB', '#003580', '#102D2B', '#1D6FA5', '#0E1A2E', '#111C33'];

  it('no client source file hardcodes a retired brand blue', () => {
    const offenders: string[] = [];
    for (const file of globSync('**/*.{ts,tsx}', { cwd: CLIENT_SRC })) {
      // Strip comments first: a comment that names the retired hex to explain
      // what it replaced is documentation, not a regression.
      const code = readFileSync(resolve(CLIENT_SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .toLowerCase();
      for (const hex of BANNED) {
        if (code.includes(hex.toLowerCase())) offenders.push(`${file} → ${hex}`);
      }
    }
    expect(
      offenders,
      `Retired brand hexes reintroduced (route these through the design tokens):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

/**
 * Pre-existing AA debt, found by this guardrail on the harmonisation pass and
 * verified present at HEAD — i.e. not introduced by that work. These tokens are
 * outside the brand-blue scope, so they are recorded rather than silently
 * re-tuned. Each is marked `it.fails`, which means:
 *
 *   · the suite stays green while the colour is still too light, and
 *   · the moment someone darkens the token to fix it, the marker flips red and
 *     asks to be deleted — so the debt cannot be forgotten.
 */
describe('known pre-existing AA debt (it.fails — delete when fixed)', () => {
  const DEBT: Array<{ label: string; scope: Scope; fg: string; bg: string }> = [
    { label: 'light: success green on base', scope: { name: 'light', source: light, min: 4.5 }, fg: '--accent-green', bg: '--bg-base' },
    { label: 'light: warm secondary on base', scope: { name: 'light', source: light, min: 4.5 }, fg: '--accent-warm', bg: '--bg-base' },
    { label: 'light: tertiary ink on base', scope: { name: 'light', source: light, min: 4.5 }, fg: '--ink-tertiary', bg: '--bg-base' },
    { label: 'dark: tertiary ink on base', scope: { name: 'dark', source: dark, min: 4.5 }, fg: '--ink-tertiary', bg: '--bg-base' },
  ];

  for (const { label, scope, fg, bg } of DEBT) {
    it.fails(label, () => {
      const fgVal = tokenIn(scope.source, fg);
      const bgVal = tokenIn(scope.source, bg);
      const ratio = contrast(fgVal, bgVal);
      expect(
        ratio,
        `${fgVal} on ${bgVal} is ${ratio.toFixed(2)}:1, below the ${scope.min}:1 minimum`,
      ).toBeGreaterThanOrEqual(scope.min);
    });
  }
});
