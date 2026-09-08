/**
 * Converts CIE Lab D50 to encoded sRGB channels on the 0–255 scale.
 * Uses Bradford D50→D65 adaptation. Values outside sRGB remain unclipped so callers can detect gamut loss.
 * Unlike this package's historical lab2rgb, the source white point is D50, as used by Photoshop and CSS Lab.
 * https://www.w3.org/TR/css-color-4/#color-conversion-code
 */
export function labD50ToRgb(lightness: number, a: number, b: number): [number, number, number] {
  const f = (lightness + 16) / 116;
  const x50 = 0.96422 * inverseLab(f + a / 500);
  const y50 = inverseLab(f);
  const z50 = 0.82521 * inverseLab(f - b / 200);
  const x = 0.9555766 * x50 - 0.0230393 * y50 + 0.0631636 * z50;
  const y = -0.0282895 * x50 + 1.0099416 * y50 + 0.0210077 * z50;
  const z = 0.0122982 * x50 - 0.020483 * y50 + 1.3299098 * z50;
  return [
    encode(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    encode(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    encode(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
  ];
}

function inverseLab(value: number) {
  return value > 6 / 29 ? value ** 3 : 3 * (6 / 29) ** 2 * (value - 4 / 29);
}

function encode(value: number) {
  const magnitude = Math.abs(value);
  return 255 * (magnitude <= 0.0031308 ? 12.92 * value : Math.sign(value) * (1.055 * magnitude ** (1 / 2.4) - 0.055));
}
