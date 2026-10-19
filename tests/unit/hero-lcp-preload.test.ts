/**
 * Hero image guard for the editorial hero.
 *
 * Why this exists: an earlier "decluttered" hero rendered no photograph at
 * all, and this guard pinned that state (no HERO_BACKDROP, no
 * `<OptimizedImage>` in the hero, no stale image preload in `index.html`).
 * The editorial redesign deliberately reintroduces ONE hero photograph, so the
 * guard now pins the contract that keeps that photo from becoming an LCP
 * regression:
 *  1. `Home.tsx` declares the hero photograph once, as `HERO_IMAGE`.
 *  2. The hero renders exactly one `<OptimizedImage>`, marked `priority`
 *     (eager loading + `fetchpriority="high"`), so it stays the LCP element.
 *  3. `client/index.html` still ships no image preload whose URL is a photo
 *     asset: the prerenderer only rewrites `<head>` metadata, so a
 *     hand-written preload would have to duplicate the optimized URL — and any
 *     drift between the two doubles the download instead of helping LCP.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const indexHtml = readFileSync(resolve(root, "client/index.html"), "utf8");
const homeSource = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");

describe("editorial hero image", () => {
  it("declares the hero photograph once, as HERO_IMAGE", () => {
    expect(homeSource).toMatch(
      /const\s+HERO_IMAGE\s*=\s*['"]https:\/\/images\.unsplash\.com\//,
    );
  });

  it("renders exactly one priority <OptimizedImage> inside the hero section", () => {
    const heroSection =
      homeSource.match(/aria-labelledby="hero-heading"([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(heroSection, "could not locate the hero <section> in Home.tsx").toBeTruthy();

    const images = heroSection.match(/<OptimizedImage/g) ?? [];
    expect(images, "the hero should render exactly one photograph").toHaveLength(1);

    const imageTag = heroSection.match(/<OptimizedImage[\s\S]*?\/>/)?.[0] ?? "";
    expect(imageTag, "the hero photograph should be the LCP candidate").toContain("priority");
    expect(imageTag, "the hero photograph should render HERO_IMAGE").toContain(
      "src={HERO_IMAGE}",
    );
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
