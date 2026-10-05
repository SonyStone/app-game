/** Picker coordinates: hue in degrees `[0, 360)`, saturation and value in `[0, 1]`. */
export type Hsv = { h: number; s: number; v: number };

/**
 * Converts `#rrggbb` to HSV. Hue is undefined for grays and saturation for black, so those components are taken from
 * `previous` when given; dragging through white or black then keeps the picker's hue and saturation.
 */
export function hexToHsv(hex: string, previous?: Hsv): Hsv {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const v = max;
  const s = max === 0 ? (previous?.s ?? 0) : delta / max;

  if (delta === 0) {
    return { h: previous?.h ?? 0, s, v };
  }

  const sector = max === r ? (g - b) / delta + 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (((sector * 60) % 360) + 360) % 360, s, v };
}

/** Converts HSV to lowercase `#rrggbb`, rounding each channel to 8 bits. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };

  return `#${[channel(5), channel(3), channel(1)]
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/**
 * Normalizes typed hex to lowercase `#rrggbb`. Accepts an optional `#` and three or six digits; returns `undefined`
 * for anything else.
 */
export function parseHex(text: string): string | undefined {
  const digits = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) {
    return `#${digits}`;
  }

  if (/^[0-9a-f]{3}$/.test(digits)) {
    return `#${[...digits].map((digit) => digit + digit).join('')}`;
  }

  return undefined;
}

/** Relative luminance of `#rrggbb` per WCAG; used to pick a legible thumb and label color over a swatch. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
