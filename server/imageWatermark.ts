// Listing-image watermarking.
//
// Composites the ALTUSplace wordmark onto uploaded listing photos so listings
// cannot be lifted and reposted on other portals. Run by `storage.uploadImage`
// in routers.ts.
//
// Ordering matters: `verifyOriginalListingImage` explicitly rejects images
// showing watermarks, so this must run AFTER that check — see routers.ts.
// Conversely the verification proof is signed over the untouched original, so
// the original buffer is still what the caller hands to
// `createImageVerificationProof`.
//
// Failure is deliberately non-fatal: if sharp or the asset is unavailable the
// original bytes are stored unwatermarked rather than rejecting the upload.
// Listing images are the primary conversion path, so taking it down over a
// watermark bug is worse than serving an unwatermarked photo.

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { logger } from "./_core/logger";

// Opacity of the mark. `composite()` has no opacity option and sharp's
// `ensureAlpha(0.3)` is a no-op on a PNG that already carries an alpha
// channel, so this has to be multiplied into the overlay's alpha band.
const WATERMARK_ALPHA = 0.3;

// Mark width as a fraction of the photo width, clamped so it stays legible on
// small images without dominating large ones.
const WIDTH_RATIO = 0.16;
const MIN_MARK_WIDTH = 96;
const MAX_MARK_WIDTH = 320;

// Inset from the bottom-right corner, as a fraction of the shorter side.
const INSET_RATIO = 0.025;
const MIN_INSET = 12;

// Re-encode settings. High enough that the second generation of compression
// is not visible on listing cards.
const JPEG_QUALITY = 90;
const WEBP_QUALITY = 90;

// Same cwd-relative lookup the PDF generators use (carRentalPdf.ts,
// commercialLeasePdf.ts). NOTE: sharp is a native module and the esbuild bundle
// externalises packages, so the deployed function must carry the platform
// binary — `pnpm build` succeeding does not prove that.
const WATERMARK_PATH = path.resolve(process.cwd(), "server/assets/watermark-altus.png");

export type WatermarkResult = {
  /** Bytes to persist. Falls back to the untouched input on failure. */
  data: Buffer;
  /** False when the image was stored unmodified. */
  watermarked: boolean;
  /**
   * Content type matching `data`. Derived from the format sharp actually
   * detected, which can differ from the caller-declared MIME type, so the
   * stored object never disagrees with its own bytes.
   */
  contentType: string;
};

// Only a successful read is cached, so a transient failure (e.g. the asset
// being restored) is retried on the next upload instead of sticking.
let cachedWatermark: Buffer | null = null;
let inFlight: Promise<Buffer> | null = null;

async function loadWatermark(): Promise<Buffer> {
  if (cachedWatermark) return cachedWatermark;
  inFlight ??= readFile(WATERMARK_PATH)
    .then((buffer) => {
      cachedWatermark = buffer;
      return buffer;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

const CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Sharp detects the real format, which may differ from the caller-declared
 * MIME type. We re-encode to the detected format and store that matching
 * content type, otherwise a mislabelled upload would be stored with a
 * content type that disagrees with its bytes.
 */
function encodeIn(source: Sharp, format: string) {
  if (format === "png") return source.png({ compressionLevel: 9 });
  if (format === "webp") return source.webp({ quality: WEBP_QUALITY });
  return source.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
}

export async function applyListingWatermark(
  input: Buffer,
  declaredMimeType: string,
): Promise<WatermarkResult> {
  // Untouched passthrough: whatever the caller declared is still accurate.
  const passThrough = (): WatermarkResult => ({
    data: input,
    watermarked: false,
    contentType: declaredMimeType,
  });

  try {
    const watermark = await loadWatermark();
    // `rotate()` with no argument applies the EXIF orientation and drops the
    // tag, so metadata and pixel dimensions agree before we position the mark.
    const base = sharp(input).rotate();
    const { width, height, format } = await base.metadata();
    if (!width || !height || !format) {
      logger.warn("[watermark] skipping: unreadable image metadata");
      return passThrough();
    }

    const markWidth = Math.max(MIN_MARK_WIDTH, Math.min(MAX_MARK_WIDTH, Math.round(width * WIDTH_RATIO)));
    if (markWidth >= width) {
      logger.warn("[watermark] skipping: image narrower than the mark", { width, markWidth });
      return passThrough();
    }
    const inset = Math.max(MIN_INSET, Math.round(Math.min(width, height) * INSET_RATIO));

    const faded = await sharp(watermark)
      .linear([1, 1, 1, WATERMARK_ALPHA], [0, 0, 0, 0])
      .resize({ width: markWidth })
      .png()
      .toBuffer();

    const { height: markHeight } = await sharp(faded).metadata();
    if (!markHeight) {
      logger.warn("[watermark] skipping: unreadable mark metadata");
      return passThrough();
    }

    const data = await encodeIn(
      base.composite([
        {
          input: faded,
          // Explicit offsets rather than `gravity: "southeast"`: sharp clamps
          // negative top/left against a corner gravity and silently falls back
          // to the top-left corner.
          left: width - markWidth - inset,
          top: height - markHeight - inset,
          blend: "over",
        },
      ]),
      format,
    ).toBuffer();

    return { data, watermarked: true, contentType: CONTENT_TYPES[format] ?? declaredMimeType };
  } catch (error) {
    logger.error("[watermark] failed, storing original unwatermarked", {
      error: error instanceof Error ? error.message : String(error),
    });
    return passThrough();
  }
}
