import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRouteMetadata } from "./_core/prerender";
import {
  classifySpaPath,
  normalizeSpaPath,
  SPA_DYNAMIC_ROUTE_PATTERNS,
  SPA_STATIC_ROUTES,
} from "../shared/routes/spaPaths";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string): string => readFileSync(resolve(root, relativePath), "utf8");

/**
 * Extract every `<Route path>` value declared in client/src/App.tsx — the
 * single source of truth for `shared/routes/spaPaths.ts`.
 */
const ROUTE_PATH_RE = /<Route\b[^>]*?\bpath=\{?(["'])(.*?)\1\}?/g;

function declaredRoutePaths(source: string): string[] {
  return [...source.matchAll(ROUTE_PATH_RE)].map((match) => match[2]);
}

/** Replace `:param` segments with a concrete id so patterns can be matched. */
function concretePath(path: string): string {
  return path.replace(/:[A-Za-z]+/g, "1");
}

describe("SPA path catalog (shared/routes/spaPaths.ts <-> client/src/App.tsx)", () => {
  const declared = declaredRoutePaths(read("client/src/App.tsx"));
  const staticDeclared = [...new Set(declared.filter((path) => !path.includes(":")))].sort();
  const dynamicDeclared = [...new Set(declared.filter((path) => path.includes(":")))].sort();

  it("classifies every static route declared in App.tsx as known", () => {
    for (const path of staticDeclared) {
      expect(classifySpaPath(path), `static route not classified known: ${path}`).toBe("known");
    }
  });

  it("has a static catalog that exactly equals App.tsx's static routes (no drift either way)", () => {
    expect([...SPA_STATIC_ROUTES].sort()).toEqual(staticDeclared);
  });

  it("classifies every dynamic route declared in App.tsx as known", () => {
    for (const path of dynamicDeclared) {
      const concrete = concretePath(path);
      expect(classifySpaPath(concrete), `dynamic route not classified known: ${path}`).toBe("known");
      expect(
        SPA_DYNAMIC_ROUTE_PATTERNS.some((pattern) => pattern.test(concrete)),
        `no dynamic pattern covers ${path}`
      ).toBe(true);
    }
  });

  it("every dynamic pattern matches at least one App.tsx route (no dead patterns)", () => {
    const concretes = dynamicDeclared.map(concretePath);
    for (const pattern of SPA_DYNAMIC_ROUTE_PATTERNS) {
      expect(
        concretes.some((concrete) => pattern.test(concrete)),
        `pattern ${pattern} matches no declared route`
      ).toBe(true);
    }
  });

  it("rejects undeclared URLs as unknown", () => {
    for (const path of ["/definitely-not-a-route", "/car", "/property", "/unknown/deep/path"]) {
      expect(classifySpaPath(path), `expected unknown: ${path}`).toBe("unknown");
    }
  });

  it("normalizes trailing slashes and query strings before classifying", () => {
    expect(classifySpaPath("/search/")).toBe("known");
    expect(classifySpaPath("/search?type=car")).toBe("known");
    expect(classifySpaPath("/car/123?utm_source=x")).toBe("known");
    expect(classifySpaPath("/city/casablanca/")).toBe("known");
    expect(normalizeSpaPath("/search/")).toBe("/search");
    expect(normalizeSpaPath("/search?type=car")).toBe("/search");
  });

  it("prerender resolves unknown URLs to 404 + noindex + homepage canonical", async () => {
    const origin = "https://altusplace.vercel.app";
    const unknown = await resolveRouteMetadata("/definitely-not-a-route", origin);
    expect(unknown.notFound).toBe(true);
    expect(unknown.robots).toContain("noindex");
    expect(unknown.canonical).toBe(`${origin}/`);

    // Known routes are still indexable 200s.
    const home = await resolveRouteMetadata("/", origin);
    expect(home.notFound).not.toBe(true);
    expect(home.robots).toContain("index");
  });
});