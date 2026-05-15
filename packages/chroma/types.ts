import type { Color } from './color';

/** Channel tuples returned by color conversion helpers. */
export type ColorSpaces = {
  rgb: [number, number, number];
  rgba: [number, number, number, number];
  hsl: [number, number, number];
  hsv: [number, number, number];
  hsi: [number, number, number];
  lab: [number, number, number];
  oklab: [number, number, number];
  lch: [number, number, number];
  oklch: [number, number, number];
  hcl: [number, number, number];
  cmyk: [number, number, number, number];
  gl: [number, number, number, number];
};

/** Interpolation modes supported by `mix()`, `interpolate()`, and scales. */
export type InterpolationMode = 'rgb' | 'hsl' | 'hsv' | 'hsi' | 'lab' | 'oklab' | 'lch' | 'oklch' | 'hcl' | 'lrgb';

/** Output modes supported by `Color.hex()`. */
export type HexMode = 'auto' | 'rgb' | 'rgba';

/** Alternate string output mode supported by `Color.css()`. */
export type CssMode = 'hsl';

/** Break calculation modes supported by `limits()`. */
export type LimitMode = 'e' | 'q' | 'l' | 'k';

export type ColorChannelArray = number[] & {
  _clipped?: boolean;
  _unclipped?: number[];
};

export type ColorInputObject = Record<string, number | undefined>;

export type ColorValue = string | number | Color | readonly number[] | ColorInputObject;

export type ColorArguments =
  | [ColorValue]
  | [string, string?]
  | [number, string?]
  | [readonly number[], string?]
  | [number, number, number, string?]
  | [number, number, number, number, string?];

export type InputFormatHandler = (...args: unknown[]) => ColorChannelArray;

export type InputAutodetectHandler = {
  p: number;
  test: (...args: unknown[]) => string | undefined;
};

export type InputRegistry = {
  format: Record<string, InputFormatHandler>;
  autodetect: InputAutodetectHandler[];
  sorted?: boolean;
};

export type Interpolator = (col1: Color, col2: Color, f: number) => Color;

export type InterpolatorRegistry = Record<string, Interpolator>;

/**
 * Scale function returned by `chroma.scale()` and `Color.scale()`.
 */
export type Scale = {
  (value: number | null | undefined): unknown;
  /** Sets the scale classes or returns the current class breaks. */
  classes: (classes?: number | number[]) => number[] | false | Scale;
  /** Sets the numeric input domain or returns the current domain. */
  domain: (domain?: number[]) => number[] | Scale;
  /** Sets the interpolation mode or returns the current mode. */
  mode: (mode?: string) => string | Scale;
  range: (colors: string | readonly ColorValue[] | ((t: number) => Color)) => Scale;
  /** Sets the output format used when calling the scale. */
  out: (output: string | false) => Scale;
  spread: (value?: number) => number | Scale;
  correctLightness: (enabled?: boolean) => Scale;
  padding: (padding?: number | number[]) => [number, number] | Scale;
  /**
   * Returns sampled colors from the scale. With no count, returns the original palette.
   */
  colors: (count?: number, output?: string) => unknown[];
  cache: (enabled?: boolean) => boolean | Scale;
  gamma: (value?: number) => number | Scale;
  nodata: (value?: ColorValue) => Color | Scale;
};

/** Cubehelix generator returned by `chroma.cubehelix()` and `Color.cubehelix()`. */
export type Cubehelix = {
  (fract: number): Color;
  /** Sets the start hue for the rotation. */
  start: (value?: number) => number | Cubehelix;
  /** Sets the number and direction of hue rotations. */
  rotations: (value?: number) => number | Cubehelix;
  /** Sets the gamma factor used to emphasize low or high intensity values. */
  gamma: (value?: number) => number | Cubehelix;
  hue: (value?: number | [number, number]) => number | [number, number] | Cubehelix;
  /** Sets the lightness range used by the generator. */
  lightness: (value?: number | [number, number]) => [number, number] | Cubehelix;
  /** Converts the generator into a regular chroma scale. */
  scale: () => Scale;
};
