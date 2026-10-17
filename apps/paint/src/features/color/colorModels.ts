/*
 * Color models for numeric color sliders: RGB channels, CIE L*a*b* and a simple CMYK. Every model describes an sRGB
 * color, so each converts from and to lowercase `#rrggbb`; values outside sRGB are clamped on the way back.
 */

/** sRGB channels from 0 to 255. */
export type Rgb = { r: number; g: number; b: number };

/** Reads the channels of `#rrggbb`. */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return { r: value >> 16, g: (value >> 8) & 255, b: value & 255 };
}

/** Writes channels as lowercase `#rrggbb`, rounding and clamping each to 0–255. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/**
 * CIE L*a*b* under D65, the white point of sRGB: lightness `l` from 0 (black) to 100 (white), `a` from green
 * (negative) to red, `b` from blue (negative) to yellow, both about −128 to 127 at most.
 */
export type Lab = { l: number; a: number; b: number };

/** Converts `#rrggbb` to CIE L*a*b*. */
export function hexToLab(hex: string): Lab {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map((channel) => decode(channel / 255)) as [number, number, number];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / white.x;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / white.z;
  const [fx, fy, fz] = [x, y, z].map(labCurve) as [number, number, number];
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Converts CIE L*a*b* to `#rrggbb`, clamping colors that sRGB cannot show channel by channel. */
export function labToHex({ l, a, b }: Lab): string {
  const fy = (l + 16) / 116;
  const x = inverseLabCurve(fy + a / 500) * white.x;
  const y = inverseLabCurve(fy);
  const z = inverseLabCurve(fy - b / 200) * white.z;
  const linear = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  ];
  const [r, g, bb] = linear.map((channel) => encode(Math.min(1, Math.max(0, channel))) * 255) as [
    number,
    number,
    number
  ];
  return rgbToHex({ r, g, b: bb });
}

/** The CIE76 color difference between two colors: about 2.3 is the smallest difference most people notice. */
export function labDistance(first: string, second: string): number {
  const one = hexToLab(first);
  const two = hexToLab(second);
  return Math.hypot(one.l - two.l, one.a - two.a, one.b - two.b);
}

/** Printing inks from 0 to 1: cyan, magenta, yellow and black. */
export type Cmyk = { c: number; m: number; y: number; k: number };

/**
 * Converts `#rrggbb` to CMYK the naive way, with as much black as the color allows. Without color the inks are
 * undefined, so for black they are taken from `previous` when given; dragging K to full black then keeps C, M and Y.
 */
export function hexToCmyk(hex: string, previous?: Cmyk): Cmyk {
  const { r, g, b } = hexToRgb(hex);
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) {
    return { c: previous?.c ?? 0, m: previous?.m ?? 0, y: previous?.y ?? 0, k: 1 };
  }

  const ink = (channel: number) => (1 - channel / 255 - k) / (1 - k);
  return { c: ink(r), m: ink(g), y: ink(b), k };
}

/**
 * Converts CMYK to `#rrggbb`: each ink takes away its share of the light, and black does not deepen a full CMY
 * black, as in Infinite Painter's CMYK sliders.
 */
export function cmykToHex({ c, m, y, k }: Cmyk): string {
  return rgbToHex({ r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k) });
}

/** D65's white in XYZ, Y being 1. */
const white = { x: 0.95047, z: 1.08883 };

/** Where the L*a*b* curve turns from a cube root into a line. */
const labEdge = 6 / 29;

function labCurve(t: number) {
  return t > labEdge ** 3 ? Math.cbrt(t) : t / (3 * labEdge ** 2) + 4 / 29;
}

function inverseLabCurve(t: number) {
  return t > labEdge ? t ** 3 : 3 * labEdge ** 2 * (t - 4 / 29);
}

/** The sRGB transfer function, encoded to linear light. */
function decode(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function encode(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}
