/**
 * Pigment-like color mixing for the mixing palette: two paints mix as pigments do, so blue and yellow make green and
 * white makes pastel tints, where averaging RGB would give grey and light blue. Each color is turned into a smooth
 * reflectance spectrum in ten bands (Smits' RGB-to-spectrum method), the bands are mixed with Kubelka–Munk theory
 * (absorption over scattering, `K/S`, averaged by concentration) and the mixed spectrum is projected back to RGB.
 * Concentrations are weighted by lightness, so dark paints do not swamp light ones as real black does: equal parts
 * of white and black give a middle grey.
 *
 * Colors are 8-bit sRGB channels; the math runs in linear light.
 */

/** An sRGB color, each channel 0–255. */
export type Rgb = readonly [number, number, number];

/**
 * Mixes `a` and `b`, with `t` the share of `b` (0 gives `a`, 1 gives `b`). Equal colors return themselves.
 */
export function mixPigments(a: Rgb, b: Rgb, t: number): Rgb {
  const out = new Float64Array(3);
  mixInto(a[0], a[1], a[2], 1 - t, b[0], b[1], b[2], t, out);
  return [out[0]!, out[1]!, out[2]!];
}

/**
 * Mixes `amountA` of color `a` with `amountB` of color `b` and writes the mixed 8-bit sRGB channels to `out`, rounded.
 * Amounts are relative quantities of paint, such as coverage; the larger one dominates. Allocation-free, for mixing
 * many pixels. Two equal colors, or a zero amount, leave a color unchanged.
 */
export function mixInto(
  ar: number,
  ag: number,
  ab: number,
  amountA: number,
  br: number,
  bg: number,
  bb: number,
  amountB: number,
  out: { [index: number]: number }
) {
  if (amountB <= 0 || (ar === br && ag === bg && ab === bb)) {
    out[0] = ar;
    out[1] = ag;
    out[2] = ab;
    return;
  }

  if (amountA <= 0) {
    out[0] = br;
    out[1] = bg;
    out[2] = bb;
    return;
  }

  const la = toLinear[ar]!,
    lga = toLinear[ag]!,
    lba = toLinear[ab]!;
  const lb = toLinear[br]!,
    lgb = toLinear[bg]!,
    lbb = toLinear[bb]!;
  spectrum(la, lga, lba, spectrumA);
  spectrum(lb, lgb, lbb, spectrumB);
  const weightA = amountA * (luminance(la, lga, lba) + lightnessFloor);
  const weightB = amountB * (luminance(lb, lgb, lbb) + lightnessFloor);
  const total = weightA + weightB;
  let r = 0,
    g = 0,
    b = 0;
  for (let band = 0; band < bands; band++) {
    const ks = (absorption(spectrumA[band]!) * weightA + absorption(spectrumB[band]!) * weightB) / total;
    const reflectance = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    r += toRgb[band]! * reflectance;
    g += toRgb[bands + band]! * reflectance;
    b += toRgb[2 * bands + band]! * reflectance;
  }

  out[0] = toSrgb8(r);
  out[1] = toSrgb8(g);
  out[2] = toSrgb8(b);
}

/** `#rrggbb` to channels. */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Channels to lowercase `#rrggbb`. */
export function rgbToHex(color: Rgb): string {
  return `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Number of spectral bands, 380–720 nm. */
const bands = 10;

/**
 * Smits' basis spectra (1999, "An RGB-to-Spectrum Conversion for Reflectances"): white and the six primaries and
 * secondaries as smooth reflectance curves. Any RGB color is a sum of white and one secondary and one primary.
 */
const basis = {
  white: [1, 1, 0.9999, 0.9993, 0.9992, 0.9998, 1, 1, 1, 1],
  cyan: [0.971, 0.9426, 1.0007, 1.0007, 1.0007, 1.0007, 0.1564, 0, 0, 0],
  magenta: [1, 1, 0.9685, 0.2229, 0, 0.0458, 0.8369, 1, 1, 0.9959],
  yellow: [0.0001, 0, 0.1088, 0.6651, 1, 1, 0.9996, 0.9586, 0.9685, 0.984],
  red: [0.1012, 0.0515, 0, 0, 0, 0, 0.8325, 1.0149, 1.0149, 1.0149],
  green: [0, 0, 0.0273, 0.7937, 1, 0.9418, 0.1719, 0, 0, 0.0025],
  blue: [1, 1, 0.8916, 0.3323, 0, 0, 0.0003, 0.0369, 0.0483, 0.0496]
} as const;

/** The RGB color each basis spectrum stands for. */
const basisColors: Record<keyof typeof basis, Rgb> = {
  white: [1, 1, 1],
  cyan: [0, 1, 1],
  magenta: [1, 0, 1],
  yellow: [1, 1, 0],
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1]
};

/** Reflectance below this counts as this, so pure black still mixes. */
const minReflectance = 0.003;

/** Added to a paint's luminance for its mixing weight, so black paint still counts. */
const lightnessFloor = 0.02;

/** Writes the reflectance spectrum of a linear RGB color to `out`. */
function spectrum(r: number, g: number, b: number, out: Float64Array) {
  if (r <= g && r <= b) {
    put(out, basis.white, r, basis.cyan, Math.min(g, b) - r, g <= b ? basis.blue : basis.green, Math.abs(b - g));
  } else if (g <= r && g <= b) {
    put(out, basis.white, g, basis.magenta, Math.min(r, b) - g, r <= b ? basis.blue : basis.red, Math.abs(b - r));
  } else {
    put(out, basis.white, b, basis.yellow, Math.min(r, g) - b, r <= g ? basis.green : basis.red, Math.abs(g - r));
  }
}

/** `out = white·w + second·s + third·t`, band by band. */
function put(
  out: Float64Array,
  white: readonly number[],
  w: number,
  second: readonly number[],
  s: number,
  third: readonly number[],
  t: number
) {
  for (let band = 0; band < bands; band++) {
    out[band] = white[band]! * w + second[band]! * s + third[band]! * t;
  }
}

/** Kubelka–Munk `K/S` of an opaque layer with reflectance `reflectance`. */
function absorption(reflectance: number) {
  const r = Math.min(1, Math.max(minReflectance, reflectance));
  return ((1 - r) * (1 - r)) / (2 * r);
}

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Projects a spectrum back to linear RGB, row-major 3 × `bands`: the least-squares inverse of the basis, so each basis
 * spectrum, and so every unmixed color, returns to its own RGB exactly.
 */
const toRgb = (() => {
  const names = Object.keys(basis) as (keyof typeof basis)[];
  const columns: readonly (readonly number[])[] = names.map((name) => basis[name]);
  const gram = columns.map((left) =>
    columns.map((right) => left.reduce((sum: number, value, band) => sum + value * right[band]!, 0))
  );
  const inverse = invert(gram);
  const matrix = new Float64Array(3 * bands);
  for (let channel = 0; channel < 3; channel++) {
    for (let band = 0; band < bands; band++) {
      let sum = 0;
      for (let i = 0; i < names.length; i++) {
        let pseudo = 0;
        for (let j = 0; j < names.length; j++) {
          pseudo += inverse[i]![j]! * columns[j]![band]!;
        }

        sum += basisColors[names[i]!][channel]! * pseudo;
      }

      matrix[channel * bands + band] = sum;
    }
  }

  return matrix;
})();

/** Inverts a small square matrix by Gauss–Jordan elimination with partial pivoting. */
function invert(matrix: number[][]) {
  const size = matrix.length;
  const rows = matrix.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) {
        pivot = row;
      }
    }

    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const lead = rows[column]![column]!;
    rows[column] = rows[column]!.map((value) => value / lead);
    for (let row = 0; row < size; row++) {
      if (row !== column) {
        const factor = rows[row]![column]!;
        rows[row] = rows[row]!.map((value, j) => value - factor * rows[column]![j]!);
      }
    }
  }

  return rows.map((row) => row.slice(size));
}

/** 8-bit sRGB to linear light. */
const toLinear = Float64Array.from({ length: 256 }, (_, value) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

/** Linear light to 8-bit sRGB, through a table of {@link srgbSteps} steps. */
function toSrgb8(linear: number) {
  const index = Math.round(Math.min(1, Math.max(0, linear)) * (srgbSteps - 1));
  return toSrgbTable[index]!;
}

const srgbSteps = 4096;
const toSrgbTable = Uint8Array.from({ length: srgbSteps }, (_, index) => {
  const v = index / (srgbSteps - 1);
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
});

/** Scratch spectra of the two colors being mixed. */
const spectrumA = new Float64Array(bands);
const spectrumB = new Float64Array(bands);
