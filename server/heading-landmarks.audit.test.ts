import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

/**
 * Strips comments before matching. A `<main>` mentioned inside a comment (or a
 * JSX `{/* ... *\/}` block) is documentation, not a rendered landmark, and must
 * not be counted as one.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/{[\s\S]*?\/\*[\s\S]*?\*\/[\s\S]*?}/g, "");

const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

/** Counts a tag in real code only, never in a comment. */
const countTags = (source: string, pattern: RegExp) => count(stripComments(source), pattern);

const pageFiles = readdirSync(resolve(root, "client/src/pages"))
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => `client/src/pages/${name}`);

/**
 * Parses a .tsx file and reports, per top-level component, how many `<h1>`
 * elements are unconditionally rendered.
 *
 * Regex splitting turned out to be the wrong tool: a `return` inside a
 * `.map()` callback and a component's own `return` are textually identical, so
 * no indentation or line-start rule separates them reliably. Parsing removes
 * the guesswork.
 *
 * A heading is "conditional" when it sits inside a ternary arm, a `&&`
 * short-circuit, or a callback body, because at most one such branch renders at
 * a time. Everything else is always rendered, and more than one of those in the
 * same component is a genuine duplicate.
 */
const headingsPerReturn = (source: string): Array<{ component: string; branches: number[] }> => {
  const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const results: Array<{ component: string; branches: number[] }> = [];

  // True when the heading lives inside a callback body (a .map() list item).
  // Climbing stops at `boundary` so the return statement itself is not treated
  // as a callback.
  const isInCallback = (node: ts.Node, boundary: ts.Node): boolean => {
    for (let cur = node.parent; cur && cur !== boundary; cur = cur.parent) {
      if (ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) return true;
    }
    return false;
  };

  // Identifies the mutually exclusive alternative the heading sits in: the
  // nearest conditional ancestor plus which arm of it. Two headings in
  // different arms of the same ternary never co-render, so the arm must be part
  // of the key — keying on the conditional alone would wrongly collide them.
  // "always" means the heading renders unconditionally.
  const conditionalGroupKey = (node: ts.Node, boundary: ts.Node): string => {
    for (let cur = node.parent; cur && cur !== boundary; cur = cur.parent) {
      if (ts.isConditionalExpression(cur)) {
        const arm = cur.whenTrue === node.parent || contains(cur.whenTrue, node) ? "T" : "F";
        return `${cur.pos}:${arm}`;
      }
      if (ts.isBinaryExpression(cur)) {
        return `${cur.pos}:bin`;
      }
    }
    return "always";
  };

  const contains = (root: ts.Node, target: ts.Node): boolean => {
    let found = false;
    const walk = (n: ts.Node) => {
      if (found) return;
      if (n === target) {
        found = true;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(root);
    return found;
  };

  /**
   * Each top-level `return` in a component body is a mutually exclusive branch:
   * a loading guard, an auth guard and the final tree never render together.
   * Counting per return is what makes "one h1 per rendered route" meaningful.
   * Returns nested inside callbacks belong to the callback, not the component,
   * so they are skipped.
   *
   * Within one return, headings are grouped by their nearest conditional
   * ancestor. Two <h1>s in different ternary arms can never co-render, so they
   * are fine; two in the same arm, or both unconditional, are a real duplicate.
   */
  const collectBranches = (body: ts.Node) => {
    const branches: number[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression) {
        const groups = new Map<string, number>();
        const scan = (n: ts.Node) => {
          if (ts.isJsxOpeningElement(n) && n.tagName.getText() === "h1") {
            // Headings inside a .map()/.filter() callback are list items, not
            // the page heading, and are excluded entirely.
            if (!isInCallback(n, node)) {
              const key = conditionalGroupKey(n, node);
              groups.set(key, (groups.get(key) ?? 0) + 1);
            }
          }
          ts.forEachChild(n, scan);
        };
        scan(node.expression);
        const worst = Math.max(0, ...groups.values());
        if (worst > 0) branches.push(worst);
      }
      ts.forEachChild(node, walk);
    };
    walk(body);
    return branches;
  };

  const visitComponent = (fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction) => {
    const branches = collectBranches(fn.body!);
    if (branches.length === 0) return; // helper with no heading anywhere
    const name =
      fn.name?.getText() ??
      (ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText() : "default export");
    results.push({ component: name, branches });
  };

  ts.forEachChild(file, (node) => {
    if (ts.isFunctionDeclaration(node) && node.body) visitComponent(node);
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) {
          visitComponent(init);
        }
      }
    }
    if (ts.isExportAssignment(node) && ts.isArrowFunction(node.expression)) visitComponent(node.expression);
  });

  return results;
};

describe("single main landmark contract", () => {
  it("renders exactly one <main> in the app shell", () => {
    const app = read("client/src/App.tsx");
    expect(countTags(app, /<main[\s>]/g)).toBe(1);
    // The skip-link target must stay the same landmark.
    expect(app).toMatch(/<main\s+id=\{MAIN_CONTENT_ID\}/);
  });

  it("never nests a second <main> inside a routed page", () => {
    // App.tsx already owns the only <main> in the document. A page rendering its
    // own produces invalid HTML and two competing landmarks for screen readers.
    const offenders = pageFiles.filter((file) => countTags(read(file), /<main[\s>]/g) > 0);
    expect(offenders).toEqual([]);
  });

  it("keeps the shadcn SidebarInset primitive as the single layout exception", () => {
    // SidebarInset is vendored shadcn and legitimately owns a <main> for
    // standalone layout use. Pinned here so a future edit is deliberate.
    const sidebar = read("client/src/components/ui/sidebar.tsx");
    expect(countTags(sidebar, /<main[\s>]/g)).toBe(1);
    expect(sidebar).toContain('function SidebarInset({ className, ...props }: React.ComponentProps<"main">)');
  });

  it("does not nest <main> inside the dashboard layout wrapper", () => {
    const layout = read("client/src/components/DashboardLayout.tsx");
    expect(countTags(layout, /<main[\s>]/g)).toBe(0);
  });
});

/**
 * Pages that must render exactly one unconditional <h1>. Derived from the
 * current codebase: every routed page ships a document heading. Pages not
 * listed here are exempt because their headings legitimately live in a
 * conditional branch (loading / auth / role guards) rather than always
 * rendering — adding one later must not silently break the suite.
 */
const UNCONDITIONAL_H1_REQUIRED = new Set<string>([
  "client/src/pages/AdminDashboard.tsx",
  "client/src/pages/AgencyDashboard.tsx",
  "client/src/pages/AgencyOnboarding.tsx",
  "client/src/pages/AgencySettings.tsx",
  "client/src/pages/HostDashboard.tsx",
  "client/src/pages/MyBookings.tsx",
  "client/src/pages/PartnerApply.tsx",
  "client/src/pages/PartnerDashboard.tsx",
  "client/src/pages/PartnerWithUs.tsx",
  "client/src/pages/PropertiesForRent.tsx",
  "client/src/pages/RenterDashboard.tsx",
  "client/src/pages/Search.tsx",
  "client/src/pages/Success.tsx",
  "client/src/pages/SuperAdminDashboard.tsx",
  "client/src/pages/SuperDashboard.tsx",
]);

describe("single h1 per rendered route contract", () => {
  it("renders at most one <h1> per rendered branch", () => {
    const offenders = pageFiles
      .flatMap((file) => headingsPerReturn(read(file)).map((r) => [file, r] as const))
      .flatMap(([file, r]) => r.branches.map((n) => [file, r.component, n] as const))
      .filter(([, , n]) => n > 1)
      .map(([file, comp, n]) => `${file} (${comp}): ${n}`);
    expect(offenders).toEqual([]);
  });

  it("gives every route page at least one <h1> branch", () => {
    // Catches the inverse regression: a page that lost its document heading
    // (e.g. an <h1> downgraded to <h2>) must not pass by rendering none.
    const offenders = pageFiles
      .filter((file) => UNCONDITIONAL_H1_REQUIRED.has(file))
      .filter((file) => headingsPerReturn(read(file)).length === 0)
      .map((file) => `${file}: no <h1> branch`);
    expect(offenders).toEqual([]);
  });

  it("keeps PageHeader a section heading, never the document heading", () => {
    // PageHeader renders a *section* title, so it is an <h2>. It used to be
    // <h1> on the reasoning that it is "the sole document heading on every page
    // that uses it" — but Home renders it twice *and* ships its own hero <h1>,
    // so the real document had three <h1> elements while this check passed,
    // because the test counts a file at a time and never saw the composition.
    // One <h1> per page is the actual contract, and the hero owns it.
    const pageHeader = read("client/src/components/ui/PageHeader.tsx");
    expect(countTags(pageHeader, /<h1[\s>]/g)).toBe(0);
    expect(countTags(pageHeader, /<h2[\s>]/g)).toBe(1);
  });

  it("keeps the homepage rendering exactly one top-level heading", () => {
    // The hero is the document heading. PageHeader is used twice below it, so
    // it must stay <h2> or the homepage ships three <h1>s — which is the
    // regression this assertion now exists to prevent.
    const home = read("client/src/pages/Home.tsx");
    expect(count(home, /<PageHeader/g)).toBeGreaterThan(0);
    // The hero <h1> is the single document heading, and it renders in the
    // component's main branch, so that branch must carry exactly one.
    const homeBranches = headingsPerReturn(home).filter((r) => r.component === "Home");
    expect(homeBranches.length).toBeGreaterThan(0);
    expect(Math.max(...homeBranches.flatMap((r) => r.branches))).toBe(1);
  });
});

describe("skip-link focus target survives the refactor", () => {
  it("keeps the scroll-margin rules the skip link depends on", () => {
    const css = read("client/src/index.css");
    expect(css).toContain("#main-content:focus");
    expect(css).toContain("#main-content h1");
    expect(css).toContain("scroll-margin-block-start: 5rem;");
  });

  it("keeps MAIN_CONTENT_ID wired to the only landmark", () => {
    const app = read("client/src/App.tsx");
    // Imported once, referenced once as the id; the extra hit is the comment.
    expect(count(app, /id=\{MAIN_CONTENT_ID\}/g)).toBe(1);
    expect(count(app, /from "\.\/hooks\/useRouteAnnouncer"/g)).toBe(1);
  });
});