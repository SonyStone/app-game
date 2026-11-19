import { zlibSync } from 'fflate';
import { crc32, inflate, join } from './binary';
import { MiB } from './zip';

/** Decoded coverage, in row-major order. Zero is transparent. */
export type Coverage = { width: number; height: number; pixels: Uint8Array };

/** Identifies decoded pixels independently of PNG filtering, metadata, and compression level. */
export async function assetId(image: Coverage) {
  dimensions(image.width, image.height);
  if (image.pixels.length !== image.width * image.height) {
    throw new Error('Incorrect r8 pixel count');
  }
  const header = new TextEncoder().encode(`r8/${image.width}/${image.height}\n`);
  const digest = await crypto.subtle.digest('SHA-256', join([header, image.pixels]));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Encodes an 8-bit grayscale PNG using unfiltered scanlines. */
export function encodePng({ width, height, pixels }: Coverage) {
  dimensions(width, height);
  if (pixels.length !== width * height) {
    throw new Error('Incorrect r8 pixel count');
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  const rows = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    rows.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  return join([signature, chunk('IHDR', header), chunk('IDAT', zlibSync(rows)), chunk('IEND', new Uint8Array())]);
}

/** Decodes all five PNG row filters within the declared pixel budget. */
export async function decodePng(bytes: Uint8Array, expected?: Pick<Coverage, 'width' | 'height'>): Promise<Coverage> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!signature.every((value, i) => value === bytes[i])) {
    throw new Error('Invalid PNG signature');
  }
  let width = 0;
  let height = 0;
  let ended = false;
  const parts: Uint8Array[] = [];
  for (let offset = 8; offset < bytes.length; ) {
    const length = view.getUint32(offset);
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length || crc32(bytes.subarray(offset + 4, end)) !== view.getUint32(end)) {
      throw new Error('Invalid PNG chunk: ' + name);
    }
    if (name === 'IHDR' && offset === 8 && length === 13) {
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      dimensions(width, height);
      if (expected && (width !== expected.width || height !== expected.height)) {
        throw new Error('Incorrect asset dimensions');
      }
      if (bytes[start + 8] !== 8 || bytes.subarray(start + 9, end).some(Boolean)) {
        throw new Error('Expected an 8-bit grayscale non-interlaced PNG');
      }
    } else if (!width) {
      throw new Error('Missing PNG header');
    } else if (name === 'IDAT') {
      parts.push(bytes.subarray(start, end));
    } else if (name === 'IEND' && length === 0 && end + 4 === bytes.length) {
      ended = true;
    } else if (/^[A-Z]/.test(name)) {
      throw new Error('Unsupported PNG chunk: ' + name);
    }
    offset = end + 4;
  }
  if (!ended) {
    throw new Error('Missing PNG end');
  }
  const rows = await inflate(join(parts), (width + 1) * height, 'deflate');
  const pixels = new Uint8Array(width * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = rows[offset++]!;
    if (filter > 4) {
      throw new Error('Unknown PNG filter');
    }
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = x ? pixels[i - 1]! : 0;
      const b = y ? pixels[i - width]! : 0;
      const c = x && y ? pixels[i - width - 1]! : 0;
      const predictor =
        filter === 4 ? paeth(a, b, c) : filter === 3 ? (a + b) >>> 1 : filter === 2 ? b : filter === 1 ? a : 0;
      pixels[i] = rows[offset++]! + predictor;
    }
  }
  return { width, height, pixels };
}

function dimensions(w: number, h: number) {
  if (![w, h].every((n) => Number.isInteger(n) && n >= 1 && n <= 8192) || w * h > 32 * MiB) {
    throw new Error('Image dimensions exceed r8 limits');
  }
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const da = Math.abs(p - a),
    db = Math.abs(p - b),
    dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

function chunk(name: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(name), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, -4)));
  return bytes;
}

const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
