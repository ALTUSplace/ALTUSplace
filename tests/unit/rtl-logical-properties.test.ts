// Group C guard: inline-axis physical utilities must not come back.
//
// The app flips document.documentElement.dir at runtime (ar -> rtl, fr/en ->
// ltr), so any physical inline-axis utility silently renders mirrored-once
// layout for half the audience. This is a cheap grep-level gate rather than a
// render assertion, because the failure mode is a wrong CSS class in a source
// file -- it cannot be caught by mounting a component in one fixed direction.
//
// Deliberately NOT banned, because they are correct as physical:
//   left-/right- paired with -translate-x-1/2  (a centering idiom that must
//     stay physical; see ui/dialog.tsx, ui/alert-dialog.tsx, ListingCard.tsx)
//   left-/right- on an element whose side is data-driven (ui/sheet.tsx,
//     ui/sidebar.tsx, ui/drawer.tsx use a `side` prop / [data-side] attribute)
//   the prose "left-to-right" in Home.tsx
//
// Banned outright, with no legitimate use found in this codebase:
//
//   ml-/mr-/pl-/pr-        -> ms-/me-/ps-/pe-
//   text-left/text-right   -> text-start/text-end
//   border-l*/border-r*    -> border-s*/border-e*
//   rounded-l*/rounded-r*  -> rounded-s*/rounded-e*
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "client", "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if ([".tsx", ".ts"].includes(extname(p))) acc.push(p);
  }
  return acc;
}

const FILES = walk(SRC).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

/**
 * A token only counts at a real class boundary. Rejecting a preceding word
 * char, hyphen or underscore is what keeps `border-lime-500`, `text-red-600`
 * and `group-data-[side=right]:-right-4` out of the results.
 */
// A token only counts at a real class boundary. Rejecting a preceding word
// char, hyphen or underscore is what keeps `border-lime-500`, `text-red-600`
// and `group-data-[side=right]:-right-4` out of the results.
function findTokens(source: string, build: (boundary: string) => RegExp): string[] {
  const re = build("(?<![A-Za-z0-9_-])");
  const hits: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    // Comments legitimately name the physical class they replaced.
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    for (const m of code.match(re) ?? []) hits.push(m);
  }
  return hits;
}
const filesWith = (re: RegExp): string[] =>
  FILES.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => relative(process.cwd(), f));

describe("rtl: inline-axis utilities are logical", () => {
  it("uses no physical margin-inline utilities", () => {
    const hits = FILES.flatMap((f) =>
      findTokens(readFileSync(f, "utf8"), (b) =>
        new RegExp(`${b}(?:-)?m[lr]-(?=[\\w[\\]./-])`, "g"),
      ).map((t) => `${relative(process.cwd(), f)}: ${t}`),
    );
    expect(hits).toEqual([]);
  });

  it("uses no physical padding-inline utilities", () => {
    const hits = FILES.flatMap((f) =>
      findTokens(readFileSync(f, "utf8"), (b) =>
        new RegExp(`${b}(?:-)?p[lr]-(?=[\\w[\\]./-])`, "g"),
      ).map((t) => `${relative(process.cwd(), f)}: ${t}`),
    );
    expect(hits).toEqual([]);
  });

  it("uses logical text alignment, not text-left/text-right", () => {
    expect(filesWith(/(?<![A-Za-z0-9_-])text-(left|right)(?![\w-])/g)).toEqual([]);
  });

  it("uses logical border edges, not border-l/border-r", () => {
    // The negative lookahead keeps the colour palettes (border-lime, border-red,
    // border-rose, border-ring) out; only a real edge matches.
    expect(filesWith(/(?<![A-Za-z0-9_-])border-[lr](?![A-Za-z\d_-])/g)).toEqual([]);
  });

  it("uses logical corner radii, not rounded-l/rounded-r", () => {
    expect(filesWith(/(?<![A-Za-z0-9_-])rounded-[lr](?![A-Za-z\d_-])/g)).toEqual([]);
  });
});

describe("rtl: direction-aware underline", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");

  it("anchors .link-underline per direction", () => {
    // background-position has no logical keyword, so an RTL override is the
    // only way to make the underline grow into the text.
    expect(css).toMatch(/\[dir="rtl"\]\s+\.link-underline\s*\{[^}]*background-position:\s*left/);
  });
});

describe("rtl: directional glyphs mirror in navigation", () => {
  // Specific, high-traffic "forward"/"back" affordances. A file that stops
  // mirroring one of these is a visible bug in Arabic.
  // Asserted as a class-string pair rather than one wide regex so that an
  // unrelated quote character between the icon and its class cannot produce a
  // false failure.
  const mirrored = [
    ["client/src/pages/Home.tsx", 'rtl:-scale-x-100'],
    ["client/src/components/ui/AuthModal.tsx", 'rtl:-scale-x-100'],
  ] as const;

  it.each(mirrored)("%s mirrors its directional glyph", (rel, mirrorClass) => {
    const source = readFileSync(join(process.cwd(), rel), "utf8");
    // Every ArrowRight usage in a navigational context must carry the mirror.
    const usages = source.match(/<ArrowRight[^>]*>/g) ?? [];
    expect(usages.length).toBeGreaterThan(0);
    for (const usage of usages) {
      expect(`${usage} -> ${usage.includes(mirrorClass)}`).toBe(`${usage} -> true`);
    }
  });

  it.each(mirrored)("%s mirrors its directional glyph", (rel, re) => {
    expect(readFileSync(join(process.cwd(), rel), "utf8")).toMatch(re);
  });
});
