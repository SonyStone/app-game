import type { Image, Plane, ResourceSource } from '../types.js';
import { Reader } from './binary.js';
import { readUnicode } from './descriptor.js';
import { byteString, unicodeText, type PlaneInfo } from './wire.js';

/** Encoded image planes; validation never allocates the expanded pixels. */
export interface Pixels {
  bounds: [number, number, number, number];
  depth: number;
  rowBytes: number;
  strips: { raw: boolean; rows: number; bytes: Uint8Array; lengths: number[] }[];
}
/** Parsed resource with original, independent payload views and positional metadata. */
export interface EncodedResource {
  id: string;
  name?: string;
  colorMode: number;
  colorChannels?: number;
  planes: Map<number, Pixels>;
  source: ResourceSource;
}
/** Parses sample layouts 1/2, including full VMAL slots and each independent compression strip. */
export function readSample(bytes: Uint8Array, layout: number): EncodedResource {
  const r = new Reader(bytes),
    id = byteString(r.take(r.u8()));
  let result: EncodedResource;
  if (layout === 1) {
    r.take(8);
    const depth = r.i16(),
      pixels = readPixels(r);
    if (depth !== pixels.depth) throw new Error('Sample depth mismatch');
    result = {
      id,
      colorMode: 1,
      colorChannels: 0,
      planes: new Map([[55, pixels]]),
      source: { kind: 'sample', layout, bytes }
    };
  } else if (layout === 2) {
    const colorMode = r.i16(),
      colorChannels = r.i16();
    result = { id, colorMode, colorChannels, planes: readVmal(r), source: { kind: 'sample', layout, bytes } };
  } else throw new Error('Unsupported sample layout');
  r.end();
  return result;
}
/** Parses version-1 patterns, including the interleaved indexed palette and alpha slot. */
export function readPattern(bytes: Uint8Array): EncodedResource {
  const r = new Reader(bytes);
  if (r.u32() !== 1) throw new Error('Unsupported pattern version');
  const mode = r.u32();
  r.take(4);
  const name = unicodeText(readUnicode(r)),
    id = byteString(r.take(r.u8())),
    palette = mode === 2 ? r.take(772) : undefined;
  const start = r.at;
  const planes = readVmal(r);
  r.end();
  return {
    id,
    name,
    colorMode: mode,
    planes,
    source: { kind: 'pattern', mode, bytes: bytes.subarray(start), ...(palette ? { palette } : {}) }
  };
}
/** Native plane bytes, without normalizing high-depth pixels or byte order. */
export function decodePlane(p: Pixels): Plane {
  const [top, left, bottom, right] = p.bounds,
    width = right - left,
    height = bottom - top,
    data = new Uint8Array(p.rowBytes * height);
  let at = 0;
  for (const strip of p.strips) {
    if (strip.raw) {
      data.set(strip.bytes, at);
      at += strip.bytes.length;
    } else {
      let source = 0;
      for (const length of strip.lengths) {
        packbits(strip.bytes.subarray(source, source + length), p.rowBytes, data, at);
        source += length;
        at += p.rowBytes;
      }
    }
  }
  return { bounds: p.bounds, width, height, depth: p.depth, data, raw: p.strips.every((s) => s.raw) };
}
/** Normalizes deterministic coverage after checking the output allocation budget. */
export function decodeImage(source: ResourceSource, maxBytes: number): Image {
  if (source.kind === 'sample') {
    const resource = readSample(source.bytes, source.layout),
      p = resource.planes.get(55);
    if (!p) throw new Error('Sample mask 55 missing');
    return image(p, maxBytes, 'Decoded brush samples exceed the byte budget');
  }
  const r = new Reader(source.bytes),
    planes = readVmal(r);
  r.end();
  const count = source.mode === 3 ? 3 : [1, 2, 7].includes(source.mode) ? 1 : 0;
  if (!count) throw new Error(`Unsupported pattern color mode ${source.mode}; profile conversion is required`);
  const required = Array.from({ length: count }, (_, i) => {
    const p = planes.get(i);
    if (!p) throw new Error(`Missing pattern color channel ${i}`);
    return p;
  });
  if ([...planes.keys()].some((k) => k !== 58 && k >= count)) throw new Error('Unexpected pattern image channels');
  const first = required[0]!;
  if (required.some((p) => p.depth !== first.depth)) throw new Error('Pattern color channel geometry/depth mismatch');
  const result = image(first, maxBytes, 'Decoded pattern exceeds the byte budget'),
    channels = [result.data, ...required.slice(1).map((p) => normalize(p))],
    alpha = planes.has(58) ? normalize(planes.get(58)!) : undefined;
  const palette = source.palette;
  let colors = 0,
    transparent = -1;
  if (source.mode === 2) {
    if (first.depth !== 8) throw new Error('Indexed pattern requires 8-bit indices');
    if (!palette || palette.length !== 772) throw new Error('Indexed pattern requires its 772-byte palette');
    const v = new DataView(palette.buffer, palette.byteOffset, palette.length);
    colors = Math.max(0, Math.min(256, v.getInt16(768)));
    transparent = v.getInt16(770);
  }
  for (let i = 0; i < result.data.length; i++) {
    let coverage = alpha?.[i] ?? 255,
      gray = channels[0]![i]!;
    if (source.mode === 2) {
      const index = gray;
      if (transparent >= 0 && transparent < colors && index === transparent) coverage = 0;
      gray = index >= colors ? 0 : luminance(palette![index * 3]!, palette![index * 3 + 1]!, palette![index * 3 + 2]!);
    } else if (source.mode === 3) gray = luminance(gray, channels[1]![i]!, channels[2]![i]!);
    const product = (255 - gray) * coverage + 128;
    result.data[i] = 255 - ((product + (product >> 8)) >> 8);
  }
  return result;
}
/** Compact index derived from the authoritative full pixel bounds. */
export function planeInfo(planes: Map<number, Pixels>): PlaneInfo[] {
  return [...planes].map(([slot, p]) => ({ slot, bounds: p.bounds, depth: p.depth }));
}
function image(p: Pixels, budget: number, message: string): Image {
  const width = p.bounds[3] - p.bounds[1],
    height = p.bounds[2] - p.bounds[0];
  if (width * height > budget) throw new Error(message);
  return { width, height, depth: 8, sourceDepth: p.depth, data: normalize(p) };
}
function normalize(p: Pixels): Uint8Array {
  const plane = decodePlane(p);
  if (p.depth === 8) return plane.data;
  const out = new Uint8Array(plane.width * plane.height),
    v = new DataView(plane.data.buffer);
  for (let y = 0; y < plane.height; y++) {
    const little = !p.strips[Math.floor(y / 16384)]!.raw;
    for (let x = 0; x < plane.width; x++) {
      const at = y * p.rowBytes;
      let value: number;
      if (p.depth === 1) value = plane.data[at + (x >> 3)]! & (128 >> (x % 8)) ? 0 : 255;
      else if (p.depth === 16) value = ((v.getUint16(at + x * 2, little) * 255 + 16384) >> 15) & 255;
      else value = Math.floor(Math.max(0, Math.min(1, v.getFloat32(at + x * 4, little))) * 255 + 0.5);
      out[y * plane.width + x] = value;
    }
  }
  return out;
}
function luminance(r: number, g: number, b: number): number {
  return (r * 0x1333 + g * 0x25c3 + b * 0x070a + 0x2000) >> 14;
}
function readVmal(r: Reader): Map<number, Pixels> {
  if (![2, 3].includes(r.u32())) throw new Error('Unsupported VMAL version');
  const body = new Reader(r.blob()),
    bounds = readBounds(body),
    count = body.u32();
  if (count > 56) throw new Error('VMAL slot count exceeds 56');
  const planes = new Map<number, Pixels>();
  for (const slot of [...Array.from({ length: count }, (_, i) => i), 56, 58]) {
    const written = body.u32();
    if (written !== 1) continue;
    const channel = new Reader(body.blob()),
      depth = channel.u32(),
      p = readPixels(channel);
    channel.end();
    if (depth !== p.depth || p.bounds.some((n, i) => n !== bounds[i])) throw new Error('VMAL bounds/depth mismatch');
    planes.set(slot, p);
  }
  body.end();
  return planes;
}
function readBounds(r: Reader): [number, number, number, number] {
  const bounds: [number, number, number, number] = [r.i32(), r.i32(), r.i32(), r.i32()];
  if (bounds[3] <= bounds[1] || bounds[2] <= bounds[0]) throw new Error('Empty or inverted rectangle');
  return bounds;
}
function readPixels(r: Reader): Pixels {
  const bounds = readBounds(r),
    depth = r.u16();
  if (![1, 8, 16, 32].includes(depth)) throw new Error('Unsupported pixel depth');
  const rowBytes = Math.ceil(((bounds[3] - bounds[1]) * depth) / 8),
    height = bounds[2] - bounds[0];
  if (rowBytes * height > 268_435_456) throw new Error('Decoded image exceeds 256 MiB codec limit');
  const strips: Pixels['strips'] = [];
  for (let y = 0; y < height; y += 16384) {
    const rows = Math.min(height - y, 16384),
      raw = r.u8() === 0,
      lengths = raw ? [] : Array.from({ length: rows }, () => r.i16());
    if (lengths.some((n) => n < 0)) throw new Error('Negative packed row length');
    const bytes = r.take(raw ? rows * rowBytes : lengths.reduce((a, b) => a + b, 0));
    if (!raw) {
      let at = 0;
      for (const n of lengths) {
        packbits(bytes.subarray(at, at + n), rowBytes);
        at += n;
      }
    }
    strips.push({ raw, rows, bytes, lengths });
  }
  return { bounds, depth, rowBytes, strips };
}
function packbits(bytes: Uint8Array, expected: number, out?: Uint8Array, offset = 0): void {
  let at = 0,
    n = 0;
  while (at < bytes.length) {
    const c = (bytes[at++]! << 24) >> 24;
    if (c === -128) continue;
    const count = c >= 0 ? c + 1 : 1 - c;
    if (count > expected - n) throw new Error('PackBits output exceeds row');
    if (c >= 0) {
      if (at + count > bytes.length) throw new Error('Truncated PackBits literal');
      out?.set(bytes.subarray(at, at + count), offset + n);
      at += count;
    } else {
      if (at >= bytes.length) throw new Error('Truncated PackBits repeat');
      const value = bytes[at++]!;
      out?.fill(value, offset + n, offset + n + count);
    }
    n += count;
  }
  if (n !== expected) throw new Error('PackBits row is short');
}
