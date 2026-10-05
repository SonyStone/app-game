/**
 * A color on the perceptual wheel: OKLab lightness `l` from 0 to 1, hue `h` in degrees `[0, 360)` as in OKLCH, and
 * saturation `s` from 0 to 1, the chroma as a share of the most that sRGB can show at that lightness and hue. Moving
 * the hue keeps the perceived lightness, unlike HSV, and every point of the wheel is a displayable color.
 */
export type WheelColor = { l: number; s: number; h: number };

/** Converts a wheel color to lowercase `#rrggbb`. */
export function wheelToHex({ l, s, h }: WheelColor): string {
  return rgbToHex(oklchToRgb(l, s * maxChroma(l, h), h));
}

/**
 * Converts `#rrggbb` to a wheel color. Hue is undefined for grays, so it is taken from `previous` when given;
 * dragging through the center then keeps the wheel's hue.
 */
export function hexToWheel(hex: string, previous?: WheelColor): WheelColor {
  const [r, g, b] = hexToLinear(hex);
  const [l, a, bb] = linearToOklab(r, g, b);
  const chroma = Math.hypot(a, bb);
  if (chroma < 1e-4) {
    return { l, s: 0, h: previous?.h ?? 0 };
  }

  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  const most = maxChroma(l, h);
  return { l, s: most > 0 ? Math.min(1, chroma / most) : 0, h };
}

/** The largest OKLCH chroma that sRGB shows at lightness `l` and hue `h`, found by bisection. */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 1) {
    return 0;
  }

  let low = 0,
    high = 0.5;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (inGamut(oklchToLinear(l, middle, h))) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
}

/** sRGB channels from 0 to 1 of an OKLCH color, clamped to the gamut. */
export function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const linear = oklchToLinear(l, c, h);
  return linear.map((channel) => encode(Math.min(1, Math.max(0, channel)))) as [number, number, number];
}

function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const angle = (h * Math.PI) / 180;
  const a = c * Math.cos(angle),
    b = c * Math.sin(angle);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const lms = [l_ ** 3, m_ ** 3, s_ ** 3] as const;
  return [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]
  ];
}

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

function inGamut(channels: readonly number[]) {
  return channels.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
}

function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return [value >> 16, (value >> 8) & 255, value & 255].map((channel) => decode(channel / 255)) as [
    number,
    number,
    number
  ];
}

/** The sRGB transfer function, linear light to encoded. */
function encode(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function decode(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function rgbToHex(channels: readonly number[]) {
  return `#${channels
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
