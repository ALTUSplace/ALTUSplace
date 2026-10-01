import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Compositor-animation guard.
 *
 * A keyframe that animates a layout/paint property (`background-position`,
 * `top`, `width`, `box-shadow`, ...) makes the browser re-run style, layout or
 * paint on every frame, on the main thread. A keyframe restricted to
 * `transform` / `opacity` can be handed to the compositor instead, which keeps
 * animating even while the main thread is busy.
 *
 * The one that motivated this: the dark-theme ambient gradient animates across
 * the full viewport, and it used to do it with `background-position` -- a
 * full-viewport repaint per frame for a full 25s cycle. It now drifts a
 * promoted ::before layer with `transform`.
 *
 * The two remaining paint animations are deliberate and allowlisted below.
 */

const CLIENT_SRC = join(process.cwd(), "client", "src");

/** Properties an animation can run without repainting the document. */
const COMPOSITOR_SAFE = new Set([
  "transform",
  "opacity",
  "filter",
  "clip-path",
  "translate",
  "rotate",
  "scale",
  "offset-distance",
]);

/**
 * Keyframes allowed to animate a paint property, keyed by keyframe name. Each
 * entry has to justify itself, so adding one is a visible review decision.
 */
const ALLOWED_PAINT_ANIMATIONS: Record<string, Record<string, string>> = {
  "skeleton-shimmer": {
    "background-position": "idiomatic shimmer, bounded to a thin skeleton bar",
  },
  "card-lift": {
    "box-shadow": "hover-only, ~200ms, on a single card",
  },
};

export interface Keyframes {
  name: string;
  line: number;
  properties: string[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

/** Declaration names inside a keyframes body, e.g. `transform`, `opacity`. */
export function animatedProperties(body: string): string[] {
  const props = new Set<string>();
  // Strip the selector braces so the body becomes a flat declaration list, then
  // read each declaration. Handles both `from { opacity: 1 }` and the multi-line
  // form, and a final declaration with no trailing semicolon.
  const flattened = body.replace(/[^{}]*\{/g, ";").replace(/\}/g, ";");
  for (const declaration of flattened.split(";")) {
    const match = /^\s*([a-z-]+)\s*:/i.exec(declaration);
    if (match) props.add(match[1].toLowerCase());
  }
  return [...props];
}

/**
 * Every `@keyframes` block, read with brace matching (a plain regex would stop
 * at the first `}` and misattribute nested declarations).
 */
export function keyframes(css: string): Keyframes[] {
  const out: Keyframes[] = [];
  const re = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const open = re.lastIndex - 1;
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ name: match[1], line: lineOf(css, match.index), properties: animatedProperties(css.slice(open + 1, i)) });
    re.lastIndex = i + 1;
  }
  return out;
}

function cssFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) cssFiles(abs, acc);
    else if (name.endsWith(".css")) acc.push(abs);
  }
  return acc;
}

const CSS_FILES = cssFiles(CLIENT_SRC).sort();
const read = (file: string) => readFileSync(file, "utf8");
const INDEX_CSS = read(join(CLIENT_SRC, "index.css"));

describe("compositor animation guard", () => {
  it("finds the stylesheet and its keyframes", () => {
    expect(CSS_FILES.length).toBeGreaterThan(0);
    expect(keyframes(INDEX_CSS).length).toBeGreaterThanOrEqual(8);
  });

  it("animates only compositor-safe properties (or an allowlisted exception)", () => {
    const violations = CSS_FILES.flatMap((file) =>
      keyframes(read(file)).flatMap((kf) =>
        kf.properties
          .filter((prop) => !COMPOSITOR_SAFE.has(prop) && !ALLOWED_PAINT_ANIMATIONS[kf.name]?.[prop])
          .map((prop) => `${relative(process.cwd(), file)}:${kf.line} @keyframes ${kf.name} animates "${prop}"`),
      ),
    );
    expect(violations).toEqual([]);
  });

  it("drives the ambient gradient with a transform, not a repaint", () => {
    const drift = keyframes(INDEX_CSS).find((kf) => kf.name === "gradient-drift");
    expect(drift, "gradient-drift keyframes are missing").toBeDefined();
    expect(drift!.properties).toContain("transform");
    expect(drift!.properties).not.toContain("background-position");
    // The old full-viewport background-position animation must be gone entirely.
    expect(INDEX_CSS).not.toMatch(/gradientShift/);
  });

  it("keeps the mobile bottom-nav backdrop blur modest", () => {
    const block = /\n\s*\.mobile-bottom-nav\s*\{([\s\S]*?)\n\s*\}/.exec(INDEX_CSS);
    expect(block, ".mobile-bottom-nav rule not found").not.toBeNull();
    const blur = /backdrop-filter:\s*blur\((\d+(?:\.\d+)?)px\)/.exec(block![1]);
    expect(blur, "no backdrop-filter blur on .mobile-bottom-nav").not.toBeNull();
    expect(Number(blur![1])).toBeLessThanOrEqual(12);
  });

  it("keeps PageTransition opacity-only", () => {
    const src = read(join(CLIENT_SRC, "components", "PageTransition.tsx"));
    // Loading state is animate-pulse (opacity), loaded state is fade-in (opacity).
    expect(src).toMatch(/animate-pulse/);
    expect(src).toMatch(/animate-in fade-in/);
    // No transform-based entry/exit that would lay out or composite a moving
    // element on every navigation.
    expect(src).not.toMatch(/\b(slide|zoom|spin|bounce|ping)-|translate|scale-/);
  });
});

/**
 * Falsification fixtures for the analyzers, so the day the parser stops
 * understanding a shape, the suite says so instead of silently passing.
 */
describe("compositor guard analyzer", () => {
  it("detects a layout property inside a keyframe", () => {
    const kf = keyframes(`@keyframes bad { 0% { left: 0; top: 10px; } 100% { left: 40px; } }`);
    expect(kf).toEqual([{ name: "bad", line: 1, properties: ["left", "top"] }]);
  });

  it("detects a paint property across multi-line, nested selectors", () => {
    const kf = keyframes(`@keyframes shimmer {\n  0% {\n    background-position: -200% 0;\n  }\n  100% {\n    background-position: 200% 0;\n  }\n}`);
    expect(kf[0].properties).toEqual(["background-position"]);
  });

  it("does not leak declarations between sibling keyframes", () => {
    const kf = keyframes(`@keyframes a { from { opacity: 0 } }\n@keyframes b { to { width: 4px } }`);
    expect(kf.map((k) => [k.name, k.properties])).toEqual([
      ["a", ["opacity"]],
      ["b", ["width"]],
    ]);
  });

  it("reports the line a keyframe starts on", () => {
    const kf = keyframes(`/* one */\n\n@keyframes later {\n  to { transform: none }\n}`);
    expect(kf[0].line).toBe(3);
    expect(kf[0].properties).toEqual(["transform"]);
  });

  it("flags a transform-only keyframe as safe", () => {
    const [kf] = keyframes(`@keyframes ok { 0% { transform: translate3d(0,0,0); opacity: 0 } }`);
    expect(kf.properties.every((p) => COMPOSITOR_SAFE.has(p))).toBe(true);
  });
});
