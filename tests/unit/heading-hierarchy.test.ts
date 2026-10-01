import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Heading-hierarchy guard.
 *
 * The original ticket was "pages with more than one <h1>". A naive `grep -c
 * '<h1'` reports 13 such pages in this repo and every one of them is a false
 * positive: the tag sits in two mutually-exclusive branches (an auth gate, a
 * role gate, an early-return error branch) or in two different route components
 * that the router picks between. Counting tags per *file* is the wrong metric,
 * because a file is not a document.
 *
 * What a reader actually gets is one rendered document, so what this checks is
 * the heading outline of a single render path:
 *
 *   1. no path emits more than one <h1>;
 *   2. no path skips a level (h1 -> h3 with no h2 between).
 *
 * Everything is derived from the source, so the rules run in milliseconds and
 * cannot drift from what ships. It is a heuristic, though, and an unverified
 * heuristic is how the false-positive list above happened in the first place --
 * so `findViolations()` is covered by fixtures at the bottom of this file that
 * make it fail on purpose.
 */

/** A page that intentionally renders no <h1>, and why. */
const NO_H1_PAGES: Record<string, string> = {
  "Checkout.tsx":
    "starts mid-flow at the payment step; App.tsx focuses #main-content as the fallback (see the comment on <main> in App.tsx).",
  "Booking.tsx": "unrouted legacy page - /booking redirects straight to /checkout.",
  "ComponentShowcase.tsx": "unreferenced dev-only component gallery.",
  "ConditionsUtilisation.tsx":
    "delegates to LegalDocPage with legal/conditions-utilisation.md, which starts with '# '.",
  "MentionsLegales.tsx":
    "delegates to LegalDocPage with legal/mentions-legales.md, which starts with '# '.",
  "PolitiqueConfidentialite.tsx":
    "delegates to LegalDocPage with legal/politique-confidentialite.md, which starts with '# '.",
};

const HEADING = /<h([1-6])(?:[\s/>]|$)/;

/**
 * Blanks comments without changing line numbers, so a prose mention of `<h1>`
 * in a comment is not mistaken for a rendered heading. The `(^|[^:])` guard
 * keeps `https://` from being treated as a line comment.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, p1: string) => p1);
}

export interface RawHeading {
  level: number;
  line: number;
  text: string;
}

export interface HeadingAnalysis {
  /** Literal headings in source order, comments excluded. */
  headings: RawHeading[];
  /** Headings grouped by (component, render path) - one document each. */
  paths: { key: string; component: string; headings: RawHeading[] }[];
}

/**
 * Splits a file into the render paths a reader can actually be shown.
 *
 * A "path" starts at one of:
 *   - a top-level component declaration (so a helper like `FeatureCards` that
 *     renders before the page's own heading is not confused with the page);
 *   - a `return`, at any indent (guard clauses are usually indented four
 *     spaces, not two);
 *   - a ternary arm opener: `cond ? (`, `) : cond ? (` or `) : (`.
 *
 * All three delimit alternatives, and only one of a set of alternatives can be
 * on screen at once.
 */
export function analyze(source: string): HeadingAnalysis {
  const raw = stripComments(source);
  const lines = raw.split(/\r?\n/);

  const components: { line: number; name: string }[] = [];
  lines.forEach((line, i) => {
    const fn = line.match(/^(?:export default |export )?(?:async )?function ([A-Z]\w*)/);
    const arrow = line.match(/^(?:export )?const ([A-Z]\w*)\s*(?::[^=]+)?=\s*\(/);
    if (fn) components.push({ line: i, name: fn[1] });
    else if (arrow) components.push({ line: i, name: arrow[1] });
  });

  const boundaries: number[] = [];
  lines.forEach((line, i) => {
    if (/^\s+return[\s(]/.test(line)) boundaries.push(i);
    else if (/\?\s*\(/.test(line) || /^\s*:\s*\(/.test(line) || /^\s*\)\s*:\s*\(/.test(line)) {
      boundaries.push(i);
    }
  });

  const componentAt = (line: number) => {
    let best: { line: number; name: string } | null = null;
    for (const c of components) if (c.line <= line) best = c;
    return best;
  };

  const sorted = [...boundaries].sort((a, b) => a - b);
  const pathAt = (line: number) => {
    const comp = componentAt(line);
    const floor = comp ? comp.line : 0;
    let last = -1;
    for (const b of sorted) if (b <= line && b >= floor) last = b;
    return last;
  };

  const headings: RawHeading[] = [];
  lines.forEach((line, i) => {
    const m = line.match(HEADING);
    if (m) headings.push({ level: Number(m[1]), line: i + 1, text: line.trim() });
  });

  const groups = new Map<string, { key: string; component: string; headings: RawHeading[] }>();
  for (const h of headings) {
    const comp = componentAt(h.line - 1);
    const start = pathAt(h.line - 1);
    const component = comp ? comp.name : "(module scope)";
    const key = `${component}#${start}`;
    if (!groups.has(key)) groups.set(key, { key, component, headings: [] });
    groups.get(key)!.headings.push(h);
  }

  return { headings, paths: [...groups.values()] };
}

export interface Violation {
  kind: "multiple-h1" | "skip";
  component: string;
  detail: string;
}

/** The invariants, as a pure function, so fixtures can assert on the result. */
export function findViolations(source: string): Violation[] {
  const problems: Violation[] = [];
  for (const path of analyze(source).paths) {
    const h1s = path.headings.filter((h) => h.level === 1);
    if (h1s.length > 1) {
      problems.push({
        kind: "multiple-h1",
        component: path.component,
        detail: `${h1s.length} <h1> on lines ${h1s.map((h) => h.line).join(", ")}`,
      });
    }
    for (let i = 1; i < path.headings.length; i++) {
      const prev = path.headings[i - 1];
      const cur = path.headings[i];
      if (cur.level - prev.level > 1) {
        problems.push({
          kind: "skip",
          component: path.component,
          detail: `h${prev.level}@${prev.line} -> h${cur.level}@${cur.line}`,
        });
      }
    }
  }
  return problems;
}

function pages(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) pages(abs, acc);
    else if (extname(abs) === ".tsx" && !name.endsWith(".test.tsx")) acc.push(abs);
  }
  return acc;
}

const PAGES_DIR = join(process.cwd(), "client", "src", "pages");
const PAGE_FILES = pages(PAGES_DIR).sort();

/** Violations under `client/src/pages`, prefixed with the file for a useful diff. */
function violationsInPages(kind?: Violation["kind"]): string[] {
  return PAGE_FILES.flatMap((file) =>
    findViolations(readFileSync(file, "utf8"))
      .filter((v) => !kind || v.kind === kind)
      .map((v) => `${relative(process.cwd(), file)} ${v.component} ${v.detail}`),
  );
}

describe("heading hierarchy", () => {
  it("finds page files to check", () => {
    // Guards the guard: a bad glob would otherwise make every assertion below
    // pass vacuously.
    expect(PAGE_FILES.length).toBeGreaterThan(20);
  });

  it("never renders more than one <h1> in a single render path", () => {
    expect(violationsInPages("multiple-h1")).toEqual([]);
  });

  it("never skips a heading level within a single render path", () => {
    expect(violationsInPages("skip")).toEqual([]);
  });

  it("documents exactly the pages that render no <h1>", () => {
    const withoutH1 = PAGE_FILES.filter(
      (file) => !analyze(readFileSync(file, "utf8")).headings.some((h) => h.level === 1),
    )
      .map((file) => relative(PAGES_DIR, file))
      .sort();

    // Bidirectional: a page that loses its <h1> must be added to the list, and a
    // page that gains one must be removed. The list cannot silently rot.
    expect(withoutH1).toEqual(Object.keys(NO_H1_PAGES).sort());
    for (const [name, reason] of Object.entries(NO_H1_PAGES)) {
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20);
    }
  });
});

/**
 * Falsification fixtures. Each one is a shape that has actually appeared in this
 * repo, so the day `analyze()` stops understanding one of them the suite says
 * so instead of quietly passing.
 */
describe("heading hierarchy analyzer", () => {
  /**
   * Removes the common indentation from a fixture. The analyzer treats a
   * component declaration at column zero as the start of a new render context,
   * matching how real page files are laid out; without this, an indented
   * fixture would be read as one anonymous module-scope block.
   */
  function dedent(source: string): string {
    const lines = source.replace(/^\n/, "").split("\n");
    const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length);
    const min = Math.min(...indents);
    return lines.map((l) => l.slice(min)).join("\n");
  }

  const check = (source: string) => findViolations(dedent(source));

  it("allows a guard-clause <h1> alongside the main one", () => {
    const src = `
      export default function Page() {
        if (bad) {
          return (
            <div>
              <h1>Could not load</h1>
            </div>
          );
        }
        return (
          <div>
            <h1>Real title</h1>
          </div>
        );
      }
    `;
    expect(check(src)).toEqual([]);
  });

  it("allows one <h1> per arm of a ternary", () => {
    const src = `
      export default function Page() {
        return (
          <div>
            {loading ? (
              <h1>Loading</h1>
            ) : privileged ? (
              <h1>Partner</h1>
            ) : (
              <h1>Visitor</h1>
            )}
          </div>
        );
      }
    `;
    expect(check(src)).toEqual([]);
  });

  it("allows one <h1> per route component in one file", () => {
    const src = `
      function ViewA() { return <h1>A</h1>; }
      function ViewB() { return <h1>B</h1>; }
      export default function Router() { return <ViewA />; }
    `;
    expect(check(src)).toEqual([]);
  });

  it("flags two <h1> in the same return", () => {
    const src = `
      export default function Page() {
        return (
          <div>
            <h1>One</h1>
            <h1>Two</h1>
          </div>
        );
      }
    `;
    const found = check(src);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("multiple-h1");
    expect(found[0].detail).toContain("2 <h1>");
  });

  it("flags a skipped level", () => {
    const src = `
      export default function Page() {
        return (
          <div>
            <h1>Title</h1>
            <h3>Jumped past h2</h3>
          </div>
        );
      }
    `;
    const found = check(src);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("skip");
    expect(found[0].detail).toBe("h1@4 -> h3@5");
  });

  it("ignores <h1> written in comments and in a multiline opening tag", () => {
    const src = `
      export default function Page() {
        // demoting this <h1> would leave the page with no heading
        /* <h1>also not real</h1> */
        return (
          <div>
            <h1
              id="hero"
            >
              Title
            </h1>
          </div>
        );
      }
    `;
    expect(check(src)).toEqual([]);
    expect(analyze(dedent(src)).headings).toHaveLength(1);
  });
});
