import type { BrushTipImage } from './library';
import { createMaskRoundingTable } from './maskRounding';

/** Prepares the fixed-point ellipse. Percentages and degrees are stored as integers;
 * nominal size is rounded and bounded to 1..5000 pixels. Soft profile expands its bounds.
 */
export function prepareComputedTip(
  size: number,
  hardness: number,
  angle: number,
  roundness: number,
  softProfile = true
) {
  if (![size, hardness, angle, roundness].every(Number.isFinite))
    throw new RangeError('Computed tip settings must be finite.');
  const nominal = Math.max(1, Math.min(5000, Math.floor(size + 0.5)));
  hardness = Math.max(0, Math.min(100, Math.round(hardness)));
  roundness = Math.max(1, Math.min(100, Math.round(roundness)));
  const factor = Math.max(0, -500 / nominal + 100.5);
  const enlargement = softProfile ? 0.013 * Math.trunc(100 - (factor * hardness) / 100) + 2 : 2;
  const major = nominal === 1 ? 2 : Math.floor((nominal === 2 ? 2.5 : nominal) * enlargement + 0.5);
  const minor = Math.min(major, Math.max(6, Math.trunc((roundness * major + 50) / 100)));
  const radians = ((((Math.round(angle) % 360) + 360) % 360) * Math.PI) / 180;
  const minimum = Math.max(1, Math.min(65535, Math.trunc(0xa0000 / major)));
  return {
    major,
    minor,
    cosine: Math.floor(Math.cos(radians) * 16384 + 0.5),
    sine: Math.floor(Math.sin(radians) * 16384 + 0.5),
    falloff: Math.trunc(((100 - hardness) * (minimum ^ 65535)) / 100) + minimum,
    softProfile
  };
}

/** Rasterizes a prepared ellipse at quarter-pixel phase. Returned bounds retain transparent pixels.
 * Explicit rounding context permits deterministic replay; default address zero is a stable product
 * phase, not a claim to reproduce Photoshop's allocation address. Throws above 64 million pixels.
 */
export function rasterizeComputedTip(
  tip: ReturnType<typeof prepareComputedTip>,
  phase: readonly [number, number] = [2, 2],
  context: ComputedTipContext = defaultContext()
) {
  const { major, minor, cosine, sine } = tip;
  if (
    !Number.isInteger(major) ||
    major < 1 ||
    major > 16500 ||
    !Number.isInteger(minor) ||
    minor < 1 ||
    minor > major ||
    !Number.isInteger(cosine) ||
    Math.abs(cosine) > 16384 ||
    !Number.isInteger(sine) ||
    Math.abs(sine) > 16384 ||
    !Number.isInteger(tip.falloff) ||
    tip.falloff < 1 ||
    tip.falloff > 65535 ||
    phase.some((value) => !Number.isInteger(value) || value < -4 || value > 4)
  )
    throw new RangeError('Computed tip preparation or quarter-pixel phase is invalid.');
  const ex = Math.min(major - 1, ((Math.abs(cosine) * major + Math.abs(sine) * minor) * 4 - 4) >> 16);
  const ey = Math.min(major - 1, ((Math.abs(cosine) * minor + Math.abs(sine) * major) * 4 - 4) >> 16);
  const left = (phase[0] - ex + 1) >> 2,
    top = (phase[1] - ey + 1) >> 2;
  const width = ((phase[0] + ex + 2) >> 2) - left,
    height = ((phase[1] + ey + 2) >> 2) - top;
  const { bytes, period } = context.rounding;
  if (
    width * height > 64_000_000 ||
    width < 0 ||
    height < 0 ||
    period <= 0 ||
    period + width > bytes.length ||
    context.profile.length !== 1024
  )
    throw new RangeError('Computed tip dimensions or rounding context are invalid.');
  const execution = context.execution;
  if (
    execution &&
    (!Number.isInteger(execution.rowStride) ||
      execution.rowStride < width ||
      execution.rowStride > 0x7fffffff ||
      !Number.isInteger(execution.maximumThreads) ||
      execution.maximumThreads < 1 ||
      execution.maximumThreads > 1024)
  )
    throw new RangeError('Computed tip row stride or execution capacity is invalid.');
  const groupRows =
    execution && width * height >= 16 ? Math.max(4, Math.ceil(height / execution.maximumThreads)) : Math.max(1, height);
  const data = new Uint8Array(width * height);
  const ox = 8 - (phase[0] - left * 4) * 4,
    oy = 8 - (phase[1] - top * 4) * 4;
  let rowX = cosine * ox - sine * oy,
    rowY = cosine * oy + sine * ox;
  let groupAddress = context.address;
  let rounding = hash(groupAddress) % period;
  for (let row = 0; row < height; row++) {
    const groupRow = row % groupRows;
    if (groupRow === 0) {
      groupAddress = (context.address + Math.imul(row, execution?.rowStride ?? 0)) >>> 0;
      rounding = hash(groupAddress) % period;
    }
    let x = rowX,
      y = rowY;
    for (let column = 0; column < width; column++) {
      const ax = Math.trunc(Math.abs(x | 0) / major),
        ay = Math.trunc(Math.abs(y | 0) / minor);
      let value = 0;
      if (ax < 65536 && ay < 65536) {
        const maximum = Math.max(ax, ay);
        if (maximum === 0) value = 255;
        else {
          const ratio = Math.trunc((Math.min(ax, ay) << 8) / maximum);
          const distance = Math.imul(maximum, hypotenuse[ratio]!) >>> 0;
          if (distance >>> 30 === 0) {
            const remaining = Math.trunc((-((distance * 4) & 0xffff0000) >>> 0) / tip.falloff);
            if (remaining >>> 16 !== 0) value = 255;
            else if (!tip.softProfile) value = ~(Math.imul(remaining, 0xffff01) >>> 16) & 255;
            else {
              const index = (-remaining >>> 6) & 0x3ff;
              value = (context.profile[index]! + bytes[rounding++]!) >>> 8;
            }
          }
        }
      }
      data[row * width + column] = value;
      x = (x + cosine * 16) | 0;
      y = (y + sine * 16) | 0;
    }
    if (rounding >= period) rounding -= period;
    if (rounding + width >= bytes.length) {
      const seed =
        groupAddress ^ (((Math.imul(groupRow, 0x41c64e6d) + 0x3039) ^ (Math.imul(width, 0x41c64e6d) + 0x3039)) >>> 3);
      rounding = hash(seed) % (bytes.length - width);
    }
    rowX = (rowX - sine * 16) | 0;
    rowY = (rowY + cosine * 16) | 0;
  }
  return { left, top, width, height, data, depth: 8 as const };
}

/** Rounding inputs for deterministic computed source generation. */
export type ComputedTipContext = {
  profile: Uint16Array;
  rounding: ReturnType<typeof createMaskRoundingTable>;
  /** Low 32 bits of the output allocation address used to select rounding bytes. */
  address: number;
  /** Optional native row partition. Omitted means one scalar group, independent of host CPU count. */
  execution?: {
    /** Effective capacity after nested execution suppression, from 1 through 1024. */
    maximumThreads: number;
    /** Original output byte stride including padding, at least the logical source width. */
    rowStride: number;
  };
};

/** Reuses the last prepared secondary mask. Callers must not mutate or transfer its pixels.
 * Stored angle/roundness are baked into this native-size source, before per-dab random rotation.
 */
export function computedSecondaryTip(
  size: number,
  settings: { hardness: number; angle: number; roundness: number }
): BrushTipImage & { key: string } {
  const prepared = prepareComputedTip(size, settings.hardness, settings.angle, settings.roundness);
  const key = `computed-secondary:${Object.values(prepared).join(':')}`;
  if (lastTip?.key === key) return lastTip;
  const tip = rasterizeComputedTip(prepared);
  if (tip.width > 8192 || tip.height > 8192 || tip.data.byteLength > 32 * 1024 * 1024)
    throw new RangeError('Computed secondary tip exceeds the 8192 px / 32 MiB brush limit.');
  lastTip = { ...tip, key };
  return lastTip;
}

/** Numerical profile whose 1024 rounded entries agree with Photoshop's radial table. */
export function computedRadialProfile(): Uint16Array {
  const exponent = Math.log(510),
    join = (1 + Math.sqrt(1 - 2 / exponent)) * 0.5;
  const slope = Math.exp(-exponent * join * join) / (1 - join);
  return Uint16Array.from({ length: 1024 }, (_, i) => {
    const radius = i / 1024;
    return Math.floor(65280 * (radius < join ? Math.exp(-exponent * radius * radius) : slope * (1 - radius)) + 0.5);
  });
}

function hash(value: number) {
  return (Math.imul(value, 0x41c64e6d) + 0x3039) >>> 3;
}
function defaultContext() {
  return (context ??= { profile: computedRadialProfile(), rounding: createMaskRoundingTable(), address: 0 });
}
let context: ComputedTipContext | undefined;
let lastTip: (BrushTipImage & { key: string }) | undefined;
const hypotenuse = Uint16Array.from({ length: 257 }, (_, i) => Math.floor(16384 * Math.sqrt(1 + (i / 256) ** 2) + 0.5));
