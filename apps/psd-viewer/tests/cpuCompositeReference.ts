import type { PsdGpuLayers } from '@app-game/psd/gpu';
import tables from '../src/features/gpu-composite/integerTables.json';

/** Independent scalar transcription of psd-rs blend.rs, pixel.rs, gamma.rs and Renderer::collapses for tests. */
export function cpuCompositeReference(
  source: PsdGpuLayers,
  gamma: boolean,
  visibility: readonly (readonly [number, boolean])[] = []
) {
  const pixels = new Uint8Array(source.rect.width * source.rect.height * 4);
  const shown = new Map(visibility);
  for (const layer of source.layers) {
    if (!(shown.get(layer.index) ?? layer.visible) || layer.ancestors.some((id) => shown.get(id) === false)) {
      continue;
    }
    for (let y = 0; y < layer.bounds.height; y++) {
      for (let x = 0; x < layer.bounds.width; x++) {
        const at =
          ((y + layer.bounds.top - source.rect.top) * source.rect.width + x + layer.bounds.left - source.rect.left) * 4;
        const sample = (y * layer.bounds.width + x) * 2;
        const packed = layer.samples[sample];
        const color = [packed & 255, (packed >>> 8) & 255, (packed >>> 16) & 255];
        const shape = mul(packed >>> 24, 255 - mul(255 - layer.samples[sample + 1], layer.density));
        const backdrop = [...pixels.subarray(at, at + 4)];
        const mode = layer.mode;
        let result;
        if (!gamma && !special(mode)) {
          result = paint(backdrop, color, mul(shape, mul(layer.fill, layer.opacity)), mode);
        } else if (shape !== 0 && layer.opacity !== 0) {
          result = interpolate(backdrop, paint(backdrop, color, layer.fill, mode), mul(shape, layer.opacity), gamma);
        } else {
          result = backdrop;
        }
        pixels.set(result, at);
      }
    }
  }
  return pixels;
}

const rd = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));
const mul = (a: number, b: number) => Math.sign(a * b) * Math.floor((Math.abs(a * b) + 127) / 255);
const norm = (part: number, total: number) => Math.min(255, rd(255 * part, Math.max(total, 1)));
const lerp = (b: number, s: number, w: number) => b + rd((s - b) * w, 255);
const clamp = (x: number) => Math.max(0, Math.min(255, x));
const screen = (b: number, s: number) => 255 - mul(255 - b, 255 - s);
const burn = (b: number, s: number) => (s === 0 ? (b === 255 ? 255 : 0) : 255 - Math.min(255, rd((255 - b) * 255, s)));
const dodge = (b: number, s: number) => (s === 255 ? (b === 0 ? 0 : 255) : Math.min(255, rd(b * 255, 255 - s)));
const low = (s: number) => rd(255 * s, 128);
const high = (s: number) => rd(255 * (s - 128), 127);
const special = (mode: number) => [5, 6, 7, 8, 12, 13, 15, 16].includes(mode);

function blend(b: number, s: number, mode: number): number {
  switch (mode) {
    case 1:
      return Math.min(b, s);
    case 2:
      return Math.max(b, s);
    case 3:
      return mul(b, s);
    case 4:
      return screen(b, s);
    case 5:
      return burn(b, s);
    case 6:
      return Math.max(0, b + s - 255);
    case 7:
      return dodge(b, s);
    case 8:
      return Math.min(255, b + s);
    case 9:
      return b < 128 ? mul(s, 2 * b) : 255 - mul(255 - s, 2 * (255 - b));
    case 10:
      return s < 128 ? b - mul(255 - 2 * s, mul(b, 255 - b)) : b + mul(2 * s - 256, tables.values[4353 + b] - b);
    case 11:
      return s < 128 ? mul(b, 2 * s) : screen(b, 2 * s - 256);
    case 12:
      return s < 128
        ? low(s) === 0
          ? 0
          : 255 - Math.min(255, rd((255 - b) * 255, low(s)))
        : high(s) === 255
          ? 255
          : Math.min(255, rd(b * 255, 255 - high(s)));
    case 13:
      return clamp(b + 2 * s - 256);
    case 14:
      return s < 128 ? Math.min(b, low(s)) : Math.max(b, high(s));
    case 15:
      return (s < 128 ? b + s >= 255 : b + s > 255) ? 255 : 0;
    case 16:
      return Math.abs(b - s);
    case 17:
      return b + s - 2 * mul(b, s);
    case 18:
      return Math.max(0, b - s);
    case 19:
      return s === 0 ? (b === 0 ? 0 : 255) : Math.min(255, rd(b * 255, s));
    default:
      return s;
  }
}
function fillBlend(b: number, s: number, fill: number, mode: number) {
  if (fill === 0) {
    return b;
  }
  if (fill === 255) {
    return blend(b, s, mode);
  }
  switch (mode) {
    case 5:
      return burn(b, 255 - mul(255 - s, fill));
    case 6:
      return Math.max(0, b - mul(255 - s, fill));
    case 7:
      return dodge(b, mul(s, fill));
    case 8:
      return Math.min(255, b + mul(s, fill));
    case 12:
      return s < 128 ? burn(b, 255 - mul(255 - low(s), fill)) : dodge(b, mul(high(s), fill));
    case 13:
      return clamp(b + rd(2 * s * fill, 255) - fill - 1);
    case 15: {
      const k = rd(254 * fill, 255);
      return clamp(rd(255 * (b + mul(s, k) - k), 255 - k));
    }
    case 16:
      return Math.abs(b - mul(s, fill));
    default:
      return lerp(b, blend(b, s, mode), fill);
  }
}
function paint(b: number[], s: number[], fill: number, mode: number) {
  const total = b[3] + fill - mul(b[3], fill);
  return [
    ...s.map((color, c) =>
      mode === 0
        ? lerp(b[c], color, norm(fill, total))
        : lerp(fillBlend(b[c], color, fill, mode), color, norm(total - b[3], total))
    ),
    total
  ];
}
function mix(b: number, s: number, weight: number, gamma: boolean) {
  if (!gamma || weight === 0 || weight === 255) {
    return lerp(b, s, weight);
  }
  const from = tables.values[b];
  const delta = tables.values[s] - from;
  const value = from + Math.sign(delta) * Math.floor((Math.abs(delta) * weight + 127) / 255);
  const index = value >> 3;
  const lo = tables.values[256 + index];
  const hi = tables.values[256 + Math.min(index + 1, 4096)];
  return (255 * (lo + Math.floor(((hi - lo) * (value & 7) + 4) / 8)) + 16384) >> 15;
}
function interpolate(b: number[], s: number[], weight: number, gamma: boolean) {
  const kept = mul(b[3], 255 - weight);
  const added = mul(s[3], weight);
  return [0, 1, 2].map((c) => mix(b[c], s[c], norm(added, kept + added), gamma)).concat(kept + added);
}
