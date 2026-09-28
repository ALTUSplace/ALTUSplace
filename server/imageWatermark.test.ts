import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyListingWatermark } from "./imageWatermark";
import { createImageVerificationProof, verifyImageVerificationProof } from "./imageVerification";

// Renders a deterministic test photo: a mid-grey field with a lighter band, so
// a bottom-right-only change is unambiguous.
function testPhoto(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: "#808080" },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
             <rect x="0" y="0" width="${width / 2}" height="${height}" fill="#c0c0c0"/>
           </svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .jpeg()
    .toBuffer();
}

/** Pixels that differ by more than `threshold` between two same-size rasters. */
async function diffPixels(a: Buffer, b: Buffer, threshold = 1) {
  const [ra, rb] = await Promise.all([
    sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(rb.info.width).toBe(ra.info.width);
  expect(rb.info.height).toBe(ra.info.height);
  const changed: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < ra.data.length; i += 3) {
    const delta = Math.max(
      Math.abs(ra.data[i]! - rb.data[i]!),
      Math.abs(ra.data[i + 1]! - rb.data[i + 1]!),
      Math.abs(ra.data[i + 2]! - rb.data[i + 2]!),
    );
    if (delta > threshold) changed.push({ x: (i / 3) % ra.info.width, y: Math.floor(i / 3 / ra.info.width) });
  }
  return changed;
}

describe("listing image watermark", () => {
  it("changes pixels only in the bottom-right corner, keeping dimensions", async () => {
    const original = await testPhoto(1200, 800);
    const result = await applyListingWatermark(original, "image/jpeg");

    expect(result.watermarked).toBe(true);
    expect(result.contentType).toBe("image/jpeg");

    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800);

    // Compare against an identical re-encode without the mark, so lossy
    // compression noise is not mistaken for the watermark.
    const control = await sharp(original).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const changed = await diffPixels(control, result.data);
    expect(changed.length).toBeGreaterThan(0);

    const xs = changed.map((p) => p.x);
    const ys = changed.map((p) => p.y);
    // Every altered pixel sits in the right half and the bottom third.
    expect(Math.min(...xs)).toBeGreaterThan(1200 * 0.5);
    expect(Math.min(...ys)).toBeGreaterThan(800 * 0.66);
  });

  it("does not stamp the top-left corner", async () => {
    // Regression guard: `gravity: "southeast"` with negative top/left makes
    // sharp clamp the offsets and fall back to the top-left corner.
    const original = await testPhoto(1200, 800);
    const result = await applyListingWatermark(original, "image/jpeg");
    const control = await sharp(original).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const changed = await diffPixels(control, result.data);
    expect(changed.every((p) => p.x > 1200 * 0.5 && p.y > 800 * 0.66)).toBe(true);
  });

  it("preserves the source format rather than the declared one", async () => {
    const png = await sharp({
      create: { width: 900, height: 700, channels: 3, background: "#404040" },
    })
      .png()
      .toBuffer();
    // Declared as JPEG but the bytes are PNG: the stored content type must
    // describe the bytes that actually get written.
    const result = await applyListingWatermark(png, "image/jpeg");
    expect(result.watermarked).toBe(true);
    expect((await sharp(result.data).metadata()).format).toBe("png");
    expect(result.contentType).toBe("image/png");
  });

  it("fails open and preserves the declared type on undecodable input", async () => {
    const garbage = Buffer.from("this is definitely not an image");
    const result = await applyListingWatermark(garbage, "image/png");
    expect(result.watermarked).toBe(false);
    expect(result.data.equals(garbage)).toBe(true);
    expect(result.contentType).toBe("image/png");
  });

  it("applies a semi-transparent mark rather than a fully opaque one", async () => {
    // A 0.3-alpha mark over mid-grey must land between grey and the mark's dark
    // plate; a fully opaque stamp (what ensureAlpha(0.3) would produce) would
    // sit at the plate colour.
    const original = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#808080" },
    })
      .jpeg()
      .toBuffer();
    const result = await applyListingWatermark(original, "image/jpeg");
    const { data, info } = await sharp(result.data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let min = 255;
    for (let i = 0; i < data.length; i += info.channels) min = Math.min(min, data[i]!);
    // Mid grey is 128; the dark plate at 0.3 over grey stays well above black.
    expect(min).toBeLessThan(128);
    expect(min).toBeGreaterThan(20);
  });
});

describe("watermark execution order in storage.uploadImage", () => {
  // The three calls in server/routers.ts have a strict order, and nothing else in
  // the type system or the compiler enforces it:
  //
  //   verifyOriginalListingImage -> applyListingWatermark -> createImageVerificationProof
  //
  // Moving the watermark earlier makes the originality screener see a watermarked
  // upload and reject legitimate photos. Moving the proof later (or pointing it at
  // the watermarked buffer) destroys the provenance anchor: the HMAC is taken over
  // the untouched original, which is the whole reason the proof is still meaningful
  // once a watermark is on the stored copy.
  //
  // Asserted against the source text rather than by driving the tRPC handler. The
  // handler needs a request context, an authed user and a database, so a
  // behavioural test here would be an integration test that belongs in a different
  // suite. A source-order assertion is blunt but it fails the moment someone
  // reorders these lines, which is the actual failure mode being guarded. The
  // companion test below covers the proof semantics behaviourally.
  const routersSource = readFileSync(fileURLToPath(new URL("./routers.ts", import.meta.url)), "utf8");

  const verifyCall = routersSource.indexOf("await verifyOriginalListingImage(");
  const watermarkCall = routersSource.indexOf("await applyListingWatermark(");
  const proofCall = routersSource.indexOf("createImageVerificationProof({");

  it("locates all three calls in the uploadImage procedure", () => {
    // If this fails, the procedure was restructured and these assertions need
    // rewriting -- not deleting.
    expect(verifyCall).toBeGreaterThan(-1);
    expect(watermarkCall).toBeGreaterThan(-1);
    expect(proofCall).toBeGreaterThan(-1);
  });

  it("verifies originality before applying the watermark", () => {
    // Otherwise the screener is handed an already-watermarked image and rejects
    // photos for a mark the platform itself applied.
    expect(verifyCall).toBeLessThan(watermarkCall);
  });

  it("applies the watermark before signing the proof", () => {
    expect(watermarkCall).toBeLessThan(proofCall);
  });

  it("stores the watermarked bytes, not the original", () => {
    // Guards against the inverse bug: watermarking, then storing the original
    // anyway, which would leave the feature a silent no-op.
    expect(routersSource).toContain("watermarked.data, watermarked.contentType");
  });

  it("signs the untouched original, not the watermarked copy", () => {
    const call = routersSource.slice(proofCall, proofCall + 200);
    expect(call).toContain("bytes: imageBuffer");
    expect(call).not.toContain("bytes: watermarked");
  });
});

describe("proof anchors the pre-watermark original", () => {
  it("validates against the original bytes and rejects the watermarked ones", async () => {
    // The behavioural half of the ordering guarantee. If someone re-points the
    // proof at the watermarked buffer, the anchor is lost: the proof would then
    // attest to bytes that anyone can reproduce by adding a known mark.
    const original = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#707070" },
    })
      .jpeg()
      .toBuffer();
    const watermarked = await applyListingWatermark(original, "image/jpeg");
    expect(watermarked.watermarked).toBe(true);
    expect(watermarked.data.equals(original)).toBe(false);

    const proof = createImageVerificationProof({ ownerId: 42, url: "https://example.test/a.jpg", bytes: original });

    expect(verifyImageVerificationProof({ proof, ownerId: 42, url: "https://example.test/a.jpg", bytes: original })).toBe(true);
    // Same image, same owner, same url -- only the bytes differ. Must fail.
    expect(verifyImageVerificationProof({ proof, ownerId: 42, url: "https://example.test/a.jpg", bytes: watermarked.data })).toBe(false);
  });
});
