/**
 * Design-token self-reference guard.
 *
 * Why this exists: `index.css` reached its `:root` tokens from `@theme` by
 * writing `--radius-xl: var(--radius-xl)`. A custom property that references
 * itself is *cyclic*, and the CSS spec makes a cyclic value
 * guaranteed-invalid — so it resolves to nothing. Because the same self-alias
 * was repeated in the legacy alias block (the last `:root` to be emitted), it
 * won the cascade and every `rounded-sm … rounded-3xl` utility in the codebase
 * silently computed to `0px`: the entire site rendered with square corners.
 * `--tap-target`, `--header-height`, `--space-section` and
 * `--content-max-width` were invalidated the same way, which also collapsed
 * `.b2-icon-button` to `min-width: auto` and cost it its 44px touch target.
 *
 * Nothing in `tsc` or the unit suite can see this — the CSS parses fine and the
 * class names are real, so the page just renders wrong. The other indirection
 * in the same block (e.g. `--color-primary: hsl(from var(--accent-primary)…)`)
 * is correct precisely because it points at a DIFFERENTLY-NAMED variable, so
 * this test pins the distinction: a self-reference is always a bug, a
 * differently-named indirection is always fine.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const CSS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../client/src/index.css",
);
const css = readFileSync(CSS_PATH, "utf8");

/** Strips comments so a token named inside prose is not mistaken for a declaration. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("design tokens never self-reference", () => {
  it("declares no `--name: var(--name)` anywhere in the stylesheet", () => {
    const offenders: string[] = [];
    // --radius-xl: var(--radius-xl) — same identifier on both sides.
    const selfRef = /--([A-Za-z0-9-]+)\s*:\s*var\(\s*--\1\s*\)/g;
    for (const match of code.matchAll(selfRef)) {
      const line = code.slice(0, match.index).split("\n").length;
      offenders.push(`line ${line}: ${match[0]}`);
    }
    expect(
      offenders,
      `Cyclic custom properties — these resolve to guaranteed-invalid and silently ` +
        `collapse their utility to 0:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps the radius scale declared exactly once, in :root", () => {
    // The scale must live in the :root source of truth and nowhere else, so the
    // design values cannot drift between two blocks.
    const rootStart = code.indexOf(":root {");
    expect(rootStart).toBeGreaterThan(-1);

    const declarations = [...code.matchAll(/--radius-(?:sm|md|lg|xl|2xl|3xl)\s*:/g)];
    expect(declarations.length, "radius scale should be declared exactly 6 times").toBe(6);

    for (const declaration of declarations) {
      expect(declaration.index, "radius scale must live inside the :root block").toBeGreaterThan(
        rootStart,
      );
    }
  });

  it("still exposes the component tokens the legacy block used to clobber", () => {
    // These four were invalidated by the same bug; assert the :root values the
    // design system documents are still present and literal.
    const expected: Record<string, string> = {
      "--tap-target": "2.75rem",
      "--content-max-width": "1200px",
    };
    for (const [token, value] of Object.entries(expected)) {
      const declaration = code.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      expect(declaration, `${token} is no longer declared`).toBeTruthy();
      expect(declaration![1].trim(), `${token} must stay a literal`).toBe(value);
    }
  });
});
