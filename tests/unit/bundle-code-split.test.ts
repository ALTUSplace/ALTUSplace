import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Bundle code-split guard.
 *
 * Three dependencies are large enough that a single static `import` from
 * client code drags them into the initial load or a route chunk:
 *
 *   mapbox-gl     ~1.9 MB (gzip ~520 kB)
 *   jspdf         ~340 kB (gzip ~110 kB)
 *   html2canvas   ~200 kB (gzip  ~47 kB, pulled in transitively by jspdf)
 *
 * Each one is already reached only through a dynamic `import()`, which is what
 * keeps it in its own chunk (`pkg-mapbox-gl`, `pdf-vendor`, ...) and out of the
 * page the visitor actually asked for. Nothing in the type system enforces
 * that -- `import { jsPDF } from "jspdf"` compiles just as happily as the
 * dynamic form -- so it is easy to undo in a one-line edit.
 *
 * This asserts the property directly: no client file statically imports any of
 * them, and each still has at least one dynamic import site (so the guard can't
 * pass just because the feature was deleted).
 */

const HEAVY_PACKAGES = ["mapbox-gl", "jspdf", "html2canvas"];

export interface ImportRef {
  specifier: string;
  line: number;
  /** `import type` / `export type` - erased by the compiler, never emitted. */
  typeOnly: boolean;
}

function sourceFile(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Static imports and re-exports. Uses the TypeScript parser rather than a
 * regex so a multi-line `import {\n jsPDF\n} from "jspdf"` is caught and an
 * explicit `import type` is not.
 */
export function staticImports(source: string, fileName = "fixture.tsx"): ImportRef[] {
  const sf = sourceFile(source, fileName);
  const found: ImportRef[] = [];
  const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  sf.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({
        specifier: node.moduleSpecifier.text,
        line: line(node),
        typeOnly: node.importClause?.isTypeOnly ?? false,
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({
        specifier: node.moduleSpecifier.text,
        line: line(node),
        typeOnly: node.isTypeOnly,
      });
    }
  });

  return found;
}

/** Specifiers reached through a dynamic `import()` anywhere in the file. */
export function dynamicImports(source: string, fileName = "fixture.tsx"): string[] {
  const sf = sourceFile(source, fileName);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) found.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function clientFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) clientFiles(abs, acc);
    else if (/\.tsx?$/.test(extname(abs)) && !/\.(test|spec)\.tsx?$/.test(name)) acc.push(abs);
  }
  return acc;
}

const CLIENT_SRC = join(process.cwd(), "client", "src");
const CLIENT_FILES = clientFiles(CLIENT_SRC).sort();

const read = (file: string) => readFileSync(file, "utf8");

describe("bundle code splitting", () => {
  it("finds client files to check", () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(50);
  });

  it("never statically imports a heavy dependency from client code", () => {
    const offenders = CLIENT_FILES.flatMap((file) =>
      staticImports(read(file), file)
        .filter((i) => !i.typeOnly && HEAVY_PACKAGES.includes(i.specifier))
        .map((i) => `${relative(process.cwd(), file)}:${i.line} imports "${i.specifier}"`),
    );
    expect(offenders).toEqual([]);
  });

  it("still reaches each directly-used heavy dependency through a dynamic import", () => {
    // Guards the guard: if the only remaining reference were deleted, the test
    // above would pass for the wrong reason. html2canvas is excluded on
    // purpose - client code never imports it directly; it is pulled in
    // transitively by jspdf's html() renderer, which is itself dynamic.
    const allDynamic = CLIENT_FILES.flatMap((file) => dynamicImports(read(file), file));
    for (const pkg of ["mapbox-gl", "jspdf"]) {
      expect(
        allDynamic.some((spec) => spec === pkg || spec.startsWith(`${pkg}/`)),
        `no dynamic import() of ${pkg} in client code`,
      ).toBe(true);
    }
  });

  it("keeps the search map out of the Search route chunk", () => {
    const search = read(join(CLIENT_SRC, "pages", "Search.tsx"));
    // Loaded lazily: only rendered in map view, and mounting it fetches the
    // 1.9 MB mapbox-gl module, so a static import would ship the map UI to
    // every visitor who never opens the map.
    expect(dynamicImports(search, "Search.tsx")).toContain("@/components/MapboxSearchMap");
    expect(
      staticImports(search, "Search.tsx").filter((i) => i.specifier === "@/components/MapboxSearchMap"),
    ).toEqual([]);
  });
});

/**
 * Falsification fixtures: each shape below is one the walker must classify
 * correctly, so the day the parser stops understanding one, the suite says so.
 */
describe("bundle code-split analyzer", () => {
  it("flags a plain static import", () => {
    const refs = staticImports(`import { jsPDF } from "jspdf";`);
    expect(refs).toEqual([{ specifier: "jspdf", line: 1, typeOnly: false }]);
  });

  it("flags a multi-line static import", () => {
    const src = `import {\n  jsPDF,\n  type jsPDFOptions,\n} from "jspdf";`;
    expect(staticImports(src).map((r) => r.specifier)).toEqual(["jspdf"]);
  });

  it("flags a bare side-effect import", () => {
    expect(staticImports(`import "html2canvas";`).map((r) => r.specifier)).toEqual(["html2canvas"]);
  });

  it("flags a re-export", () => {
    expect(staticImports(`export { jsPDF } from "jspdf";`).map((r) => r.specifier)).toEqual(["jspdf"]);
  });

  it("ignores import type", () => {
    const refs = staticImports(`import type mapboxgl from "mapbox-gl";`);
    expect(refs).toEqual([{ specifier: "mapbox-gl", line: 1, typeOnly: true }]);
    expect(refs.filter((r) => !r.typeOnly)).toEqual([]);
  });

  it("does not treat a dynamic import as static", () => {
    const src = `const { jsPDF } = await import("jspdf");`;
    expect(staticImports(src)).toEqual([]);
    expect(dynamicImports(src)).toEqual(["jspdf"]);
  });

  it("finds a dynamic import nested inside a function", () => {
    const src = `export function load() {\n  return import("mapbox-gl");\n}`;
    expect(dynamicImports(src)).toEqual(["mapbox-gl"]);
  });
});
