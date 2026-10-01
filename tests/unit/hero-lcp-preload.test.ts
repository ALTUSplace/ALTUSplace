/**
 * Hero LCP preload guard.
 *
 * Why this exists: `client/index.html` carried a hard-coded
 * `<link rel="preload" as="image">` for `photo-1503376780353` at `w=900`,
 * while the hero backdrop rendered by `Home.tsx` is a *different* photo
 * (`photo-1600585154340`) rendered through `OptimizedImage`, which rewrites
 * quality to 76 and emits a 320/640/960/1280 `srcset`. So the preload was
 * strictly wasted: the browser fetched one image that nothing on the page
 * referenced, and the image that actually became the LCP element started its
 * network request only after the bundle parsed. Two fetches, zero LCP benefit —
 * and invisible to `tsc` and to every other test, because both URLs are
 * syntactically valid.
 *
 * The hero is a responsive `srcset`, so a single-`href` preload can never be
 * reused: the browser only reuses a preloaded image when the preload's
 * `imagesrcset`/`imagesizes` resolve to the same candidate the `<img>` picks.
 * This test pins all three facts that must agree:
 *   1. the photo id in `index.html` === `HERO_BACKDROP` in `Home.tsx`
 *   2. the preload's `imagesrcset` === what `imageSrcSet()` actually generates
 *   3. the preload's `imagesizes` === the hero `<img>`'s `sizes` prop
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const indexHtml = readFileSync(resolve(root, "client/index.html"), "utf8");
const homeSource = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");

/** Pulls the hero photo id out of the `HERO_BACKDROP` constant. */
const heroPhotoId = homeSource.match(
  /const HERO_BACKDROP\s*=\s*'[^']*?\/([^/?']+)\?/,
)?.[1];

/** The single image preload shipped in the document head. */
const preloadTag = indexHtml.match(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/)?.[0];

const attribute = (name: string): string | undefined =>
  preloadTag
    ?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
    ?.replace(/&amp;/g, "&");

/** Photo id of a single candidate URL inside the imagesrcset. */
const candidatePhotoId = (url: string): string | undefined =>
  url.trim().split(" ")[0].match(/\/([^/?]+)\?/)?.[1];

describe("hero LCP preload", () => {
  beforeAll(() => {
    // `optimizeImageUrl` builds candidate URLs with
    // `new URL(source, window.location.origin)`. The node test environment has
    // no `window`, and the resulting ReferenceError is swallowed by that
    // function's try/catch — which would silently return the *unoptimised*
    // source (q=80) and make every assertion below compare the wrong strings.
    (globalThis as { window?: unknown }).window = {
      location: { origin: "https://altusplace.test" },
    };
  });

  it("finds a hero backdrop and an image preload to compare", () => {
    expect(heroPhotoId, "could not parse HERO_BACKDROP from Home.tsx").toBeTruthy();
    expect(preloadTag, "no <link rel=preload as=image> in client/index.html").toBeTruthy();
  });

  it("preloads the same photo the hero actually renders", () => {
    const hrefPhotoId = candidatePhotoId(attribute("href") ?? "");
    const preloadedPhotos = [
      hrefPhotoId,
      ...(attribute("imagesrcset")?.split(",").map(candidatePhotoId) ?? []),
    ].filter((photo): photo is string => Boolean(photo));

    expect(preloadedPhotos.length).toBeGreaterThan(0);
    for (const photo of preloadedPhotos) {
      expect(
        photo,
        `client/index.html preloads photo "${photo}" but Home.tsx renders ` +
          `"${heroPhotoId}" — the preload is a wasted download and the real LCP ` +
          `image is still not preloaded`,
      ).toBe(heroPhotoId);
    }
  });

  it("uses imagesrcset so the responsive hero reuses the preload instead of refetching", () => {
    const imagesrcset = attribute("imagesrcset");
    expect(
      imagesrcset,
      "a single-href preload cannot be reused by the hero's srcset; " +
        "imagesrcset + imagesizes are required",
    ).toBeTruthy();
    expect(attribute("imagesizes"), "imagesrcset requires a matching imagesizes").toBeTruthy();
  });

  it("declares the exact candidate URLs imageSrcSet() generates", async () => {
    const { imageSrcSet } = await import("@/lib/imageUrl");

    const source = `https://images.unsplash.com/${heroPhotoId}?auto=format&fit=crop&q=80&w=1920`;
    expect(
      attribute("imagesrcset"),
      "preload candidates drifted from imageSrcSet() in client/src/lib/imageUrl.ts",
    ).toBe(imageSrcSet(source));
  });

  it("preloads with the same sizes the hero img declares", () => {
    const heroSizes = homeSource.match(/<OptimizedImage[\s\S]{0,400}?sizes="([^"]*)"/)?.[1];
    expect(heroSizes, "could not find the hero <OptimizedImage> sizes prop").toBeTruthy();
    expect(attribute("imagesizes")).toBe(heroSizes);
  });
});