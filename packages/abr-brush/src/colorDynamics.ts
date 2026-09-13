import type { BrushFormValues } from './form';

/** Photoshop RGB Paintbrush Color Dynamics. Inputs/outputs use its 0..32768
 * channel range; random callbacks are independent Park-Miller streams / 2^31.
 * Executable evidence is maintained in the separate photoshop-analysis project.
 */
export function dabColor(
  foreground: readonly number[],
  background: readonly number[],
  values: BrushFormValues['colorDynamics'],
  deviceValue: number,
  step: number,
  random: ColorRandom
): [number, number, number] {
  const base = colorControl(values.control, values.fade, deviceValue, step);
  const amount = foregroundAmount(base, values.foregroundBackgroundJitter, random.foreground);
  const weight = (amount * 257 + 1) >> 1;
  const rgb = [0, 1, 2].map((i) =>
    Math.floor((weight * foreground[i]! + (32768 - weight) * background[i]! + 16384) / 32768)
  );
  return jitterColor(rgb, values, random);
}

/** Each channel advances only when Photoshop evaluates that nonzero jitter. */
export type ColorRandom = {
  foreground: () => number;
  hue: () => number;
  saturation: () => number;
  brightness: () => number;
};

/** Device input is already normalized. Fade counts spacing events, starting at zero. */
export function colorControl(control: number, fade: number, deviceValue: number, step: number): number {
  if (control === 1) {
    if (step >= fade) return 0;
    // ApplicationServices FixDiv rounds; FixMul rounds positive products upward.
    return Math.min(255, Math.ceil(Math.round((fade - step) * 65536 / fade) * 255 / 65536));
  }
  if (control === 2) return clampByte(Math.trunc(Math.fround(Math.fround(deviceValue) * 255 + 0.5)));
  if (control === 4) return clampByte(Math.trunc(Math.fround(Math.fround(deviceValue) * 255) + 0.5));
  if (control === 3 || control === 8) return clampByte(Math.trunc(deviceValue * 255));
  return 255;
}

/** Signed, capped integer jitter followed by Photoshop's byte reflection. */
export function foregroundAmount(base: number, jitter: number, random: () => number): number {
  const amplitude = jitter * 0.01 * base;
  if (amplitude <= 0) return base;
  const bound = Math.trunc(amplitude);
  const offset = Math.max(-bound, Math.min(bound, Math.floor(2 * amplitude * (random() - 0.5) + 0.5)));
  const value = base + offset;
  return clampByte(value < 0 ? -value : value > 255 ? 510 - value : value);
}

/** Adjusts RGB through Photoshop's integer HSV conversion and reflected jitter. */
export function jitterColor(
  rgb: readonly number[],
  values: Pick<BrushFormValues['colorDynamics'], 'hueJitter' | 'saturationJitter' | 'brightnessJitter' | 'purity'>,
  random: Pick<ColorRandom, 'hue' | 'saturation' | 'brightness'>
): [number, number, number] {
  if (!(values.hueJitter || values.saturationJitter || values.brightnessJitter || values.purity)) {
    return [rgb[0]!, rgb[1]!, rgb[2]!];
  }
  let [h, s, v] = rgbToHsv(rgb.map((c) => Math.floor((c * 65535 + 16384) / 32768)));
  if (s !== 0) {
    if (values.hueJitter !== 0) {
      const delta = floatJitter(Math.fround(Math.fround(values.hueJitter) * Math.fround(1.8)), random.hue);
      const degrees = (((h * 360 + 32768) >>> 16) % 360 + delta + 360) % 360;
      h = Math.floor((degrees * 8192 + 22) / 45);
    }
    if (values.saturationJitter !== 0) {
      s = reflect16(s + floatJitter(Math.fround(Math.fround(values.saturationJitter) * Math.fround(655.35)), random.saturation));
    }
  }
  if (values.brightnessJitter !== 0) {
    v = reflect16(v + floatJitter(Math.fround(Math.fround(values.brightnessJitter) * Math.fround(655.35)), random.brightness));
  }
  if (values.purity !== 0) s = purityByte(s >>> 8, values.purity) * 257;
  const result = hsvToRgb(h, s, v).map((c) => Math.floor((c * 32768 + 32768) / 65535));
  return [result[0]!, result[1]!, result[2]!];
}

/** Photoshop's purity LUT deliberately keeps its zero-saturation entry at zero. */
export function purityByte(saturation: number, purity: number): number {
  if (saturation === 0) return 0;
  const amount = Math.abs(purity) * 0.01;
  const difference = (purity < 0 ? 0 : 255) - saturation;
  // The setup loop uses a fused multiply-add. Its final half-integer rounding
  // changes some table entries if the product is rounded before the addition.
  const split = 134217729 * amount;
  const high = split - (split - amount), low = amount - high;
  const product = amount * difference;
  const productError = (high * difference - product) + low * difference;
  const sum = saturation + product;
  const part = sum - saturation;
  const sumError = (saturation - (sum - part)) + (product - part);
  return Math.trunc(sum + (sumError + productError) + 0.5);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

/** Float random channel 9/10/11, with truncation after Photoshop's float32 operations. */
function floatJitter(amplitude: number, random: () => number): number {
  return Math.trunc(Math.fround(Math.fround(amplitude + amplitude) * Math.fround(Math.fround(random()) - 0.5)));
}

function reflect16(value: number): number {
  return (value < 0 ? -value : value > 65535 ? 131070 - value : value) & 65535;
}

function rgbToHsv(rgb: readonly number[]): [number, number, number] {
  const [r, g, b] = rgb as [number, number, number];
  const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
  if (maximum === 0) return [0, 0, 0];
  const delta = maximum - minimum;
  const saturation = Math.trunc(delta / maximum * 65535);
  if (saturation === 0) return [0, saturation, maximum];
  const red = (maximum - r) / delta, green = (maximum - g) / delta, blue = (maximum - b) / delta;
  let hue = maximum === r ? blue - green : maximum === g ? red + 2 - blue : green + 4 - red;
  if (hue < 0) hue += 6;
  return [Math.trunc(hue / 6 * 65535), saturation, maximum];
}

/** The original HSV conversion uses 65536 for products, including its fractional hue. */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v];
  const sector = (h * 6) >>> 16, fraction = (h * 6) & 65534;
  const p = Math.floor(((65536 - s) * v + 32768) / 65536);
  const q = Math.floor(((65536 - Math.floor((fraction * s + 32768) / 65536)) * v + 32768) / 65536);
  const t = Math.floor(((65536 - Math.floor(((65536 - fraction) * s + 32768) / 65536)) * v + 32768) / 65536);
  switch (sector) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
