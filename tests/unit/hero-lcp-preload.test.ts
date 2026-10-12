/**
 * Hero preload guard for the decluttered hero.
 *
 * Why this exists: the photographic hero (`HERO_BACKDROP` in `Home.tsx`) was
 * removed in favour of a clean, theme-aware gradient surface. A stale
 * `<link rel="preload" as="image">` for that photo would still be a wasted
 * download (nothing on the page references it) while pretending to help LCP —
 * exactly the failure this guard used to catch. It now pins the inverse:
 *  1. `Home.tsx` no longer declares a hero-backdrop photograph to preload.
 *  2. `client/index.html` ships no image preload whose URL is a photo asset
 *     (no dead hero preload survives a future hero photo reintroduction).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const indexHtml = readFileSync(resolve(root, "client/index.html"), "utf8");
const homeSource = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");

describe("hero preload after decluttering", () => {
  it("no longer ships a HERO_BACKDROP constant to preload", () => {
    expect(homeSource).not.toMatch(/const\s+HERO_BACKDROP\s*=/);
  });

  it("renders no photographic <OptimizedImage> inside the hero section", () => {
    const heroSection = homeSource.match(
      /aria-labelledby="hero-heading"([\s\S]*?)<\/section>/,
    )?.[1] ?? "";
    expect(heroSection, "could not locate the hero <section> in Home.tsx").toBeTruthy();
    expect(heroSection).not.toContain("<OptimizedImage");
  });

  it("index.html has no image preload pointing at a photo asset", () => {
    const imagePreloads = Array.from(
      indexHtml.matchAll(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g),
    ).map((match) => match[0]);

    for (const tag of imagePreloads) {
      const urls = [
        tag.match(/\bhref="([^"]+)"/)?.[1],
        tag.match(/imagesrcset="([^"]+)"/)?.[1],
      ]
        .filter((url): url is string => Boolean(url))
        .join(" ");
      expect(
        urls,
        `client/index.html ships an image preload for a photographic asset: ${tag}`,
      ).not.toMatch(/images\.unsplash\.com/);
    }
  });
});