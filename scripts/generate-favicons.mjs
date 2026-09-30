/**
 * Generates favicon.ico and PWA icons from client/public/images/logo.png:
 * decodes the RGBA PNG (8-bit, non-interlaced), aspect-fits it onto square
 * transparent canvases via nearest-neighbor resampling, encodes PNGs, runs a
 * palette-optimization pass over every output (indexed PNG + tRNS alpha), and
 * packs the small sizes into a PNG-compressed .ico container.
 *
 * The palette pass is load-bearing: the icons are a flat mark on a fully
 * transparent canvas, so indexed colour is visually lossless, while the raw
 * RGBA encodes are ~10-30x larger and regress mobile LCP on every page.
 *
 * Usage: node scripts/generate-favicons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "client", "public", "images", "logo.png");
const OUT_DIR = path.join(ROOT, "client", "public");

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- PNG decode ----------
function decodePng(file) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error("Not a PNG file");

  let offset = 8;
  let header = null;
  const idat = [];
  let palette = null;
  let transparency = null;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      transparency = Buffer.from(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const { width, height, bitDepth, colorType, interlace } = header;
  // Accept both the truecolour+alpha output of image tooling (colour type 6)
  // and the indexed+alpha output this project standardised on (colour type 3,
  // see the palette pass below), so the source logo may be either format.
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 3)) {
    throw new Error(`Unsupported PNG: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }

  const channels = colorType === 6 ? 4 : 1;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const plane = Buffer.alloc(width * height * channels);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? current[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = line[i]; break;
        case 1: value = line[i] + a; break;
        case 2: value = line[i] + b; break;
        case 3: value = line[i] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value = line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unknown filter ${filter}`);
      }
      current[i] = value & 0xff;
    }
    current.copy(plane, y * stride);
    previous = current;
  }

  if (colorType === 6) return { width, height, pixels: plane };

  if (!palette) throw new Error("Indexed PNG is missing its PLTE chunk");
  const entries = palette.length / 3;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const index = plane[i];
    if (index >= entries) throw new Error(`Palette index ${index} out of range (${entries} entries)`);
    pixels[i * 4] = palette[index * 3];
    pixels[i * 4 + 1] = palette[index * 3 + 1];
    pixels[i * 4 + 2] = palette[index * 3 + 2];
    // tRNS may be shorter than the palette; missing entries are fully opaque.
    pixels[i * 4 + 3] = transparency && index < transparency.length ? transparency[index] : 255;
  }
  return { width, height, pixels };
}

// ---------- resample ----------
function fitSquare(src, size) {
  const scale = Math.min(size / src.width, size / src.height);
  const cw = Math.max(1, Math.round(src.width * scale));
  const ch = Math.max(1, Math.round(src.height * scale));
  const ox = Math.floor((size - cw) / 2);
  const oy = Math.floor((size - ch) / 2);
  const out = Buffer.alloc(size * size * 4); // transparent background
  for (let y = 0; y < ch; y++) {
    const srcY = Math.min(src.height - 1, Math.floor((y / ch) * src.height));
    for (let x = 0; x < cw; x++) {
      const srcX = Math.min(src.width - 1, Math.floor((x / cw) * src.width));
      const s = (srcY * src.width + srcX) * 4;
      const d = ((y + oy) * size + (x + ox)) * 4;
      out[d] = src.pixels[s];
      out[d + 1] = src.pixels[s + 1];
      out[d + 2] = src.pixels[s + 2];
      out[d + 3] = src.pixels[s + 3];
    }
  }
  return { size, pixels: out };
}

// ---------- PNG encode ----------
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng({ size, pixels }) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- palette optimization ----------
/**
 * Post-encode pass: re-encode a generated RGBA PNG as an indexed PNG with a
 * tRNS alpha channel. Deterministic and visually lossless for these flat icons,
 * it is what keeps the committed icons small on every regeneration.
 */
async function optimizePng(buf) {
  return sharp(buf)
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer();
}

// ---------- build ----------
const src = decodePng(SRC);
console.log(`Source: ${src.width}x${src.height} RGBA`);

const rendered = new Map();
for (const size of [512, 192, 64, 48, 32, 16]) {
  rendered.set(size, await optimizePng(encodePng(fitSquare(src, size))));
}

// favicon.ico: PNG-compressed entries (valid on Windows Vista+ and all browsers)
const icoSizes = [16, 32, 48];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
const entries = [];
let offset = 6 + 16 * icoSizes.length;
for (const size of icoSizes) {
  const blob = rendered.get(size);
  const entry = Buffer.alloc(16);
  entry[0] = size < 256 ? size : 0;
  entry[1] = size < 256 ? size : 0;
  entry.writeUInt16LE(1, 4); // color plane
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(blob.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += blob.length;
}
writeFileSync(
  path.join(OUT_DIR, "favicon.ico"),
  Buffer.concat([header, ...entries, ...icoSizes.map((s) => rendered.get(s))]),
);

writeFileSync(path.join(OUT_DIR, "images", "icon-192.png"), rendered.get(192));
writeFileSync(path.join(OUT_DIR, "images", "icon-512.png"), rendered.get(512));

const kb = (n) => (n / 1024).toFixed(1);
console.log(
  `Written: favicon.ico (16/32/48), images/icon-192.png (${kb(rendered.get(192).length)} kB), ` +
    `images/icon-512.png (${kb(rendered.get(512).length)} kB)`,
);

