import type { Color } from './color';
import type { ColorBrewerName } from './colors/colorbrewer';

/** Opaque nominal marker for distinguishing semantically different values. */
export type Brand<Value, Tag extends string> = Value & { readonly __brand: Tag };

export type RgbChannels = [RgbChannel, RgbChannel, RgbChannel];
export type RgbaChannels = [RgbChannel, RgbChannel, RgbChannel, AlphaChannel];
export type CmykChannels = [NormalizedChannel, NormalizedChannel, NormalizedChannel, NormalizedChannel];
export type LabChannels = [LabLightness, LabAxis, LabAxis];
export type OklabChannels = [OklabLightness, LabAxis, LabAxis];
export type LchChannels = [LabLightness, PolarColorChroma, HueDegrees];
export type OklchChannels = [OklabLightness, PolarColorChroma, HueDegrees];
export type HclChannels = [HueDegrees, PolarColorChroma, LabLightness];
export type HslChannels = [HueDegrees, NormalizedChannel, NormalizedChannel];
export type HsvChannels = [HueDegrees, NormalizedChannel, NormalizedChannel];
export type HsiChannels = [HueDegrees, NormalizedChannel, NormalizedChannel];
export type HcgChannels = [HueDegrees, PercentageChannel, PercentageChannel];
export type GlChannels = [NormalizedChannel, NormalizedChannel, NormalizedChannel, AlphaChannel];

/** Channel tuples returned by color conversion helpers. */
export type ColorSpaces = {
  rgb: RgbChannels;
  rgba: RgbaChannels;
  hcg: HcgChannels;
  hsl: HslChannels;
  hsv: HsvChannels;
  hsi: HsiChannels;
  lab: LabChannels;
  oklab: OklabChannels;
  lch: LchChannels;
  oklch: OklchChannels;
  hcl: HclChannels;
  cmyk: CmykChannels;
  gl: GlChannels;
};

/** Interpolation modes supported by `mix()`, `interpolate()`, and scales. */
export type InterpolationMode =
  | 'rgb'
  | 'hsl'
  | 'hsv'
  | 'hsi'
  | 'hcg'
  | 'lab'
  | 'oklab'
  | 'lch'
  | 'oklch'
  | 'hcl'
  | 'lrgb';

export type ColorSpaceName = keyof ColorSpaces;

/** Output modes supported by `Color.hex()`. */
export type HexMode = 'auto' | 'rgb' | 'rgba';

export type HexString = `#${string}`;

/** Alternate string output mode supported by `Color.css()`. */
export type CssMode = 'hsl';

/** Break calculation modes supported by `limits()`. */
export type LimitMode = 'e' | 'q' | 'l' | 'k';

export type AnalysisMode = LimitMode | 'equal';
export type RegisteredInterpolatorMode = InterpolationMode | 'num';

export type InputFormatName =
  | 'cmyk'
  | 'css'
  | 'gl'
  | 'hcg'
  | 'hcl'
  | 'hex'
  | 'hsi'
  | 'hsl'
  | 'hsv'
  | 'kelvin'
  | 'lab'
  | 'lch'
  | 'named'
  | 'num'
  | 'oklab'
  | 'oklch'
  | 'rgb'
  | 'temp'
  | 'temperature';

export type FactoryColorSpaceName = Exclude<InputFormatName, 'named'>;

/** `u32` priority for input autodetect ordering. */
export type AutodetectPriority = Brand<number, 'AutodetectPriority'>;

/** CSS color string accepted by the CSS parser. */
export type CssColorString = Brand<string, 'CssColorString'>;

/** `f32` alpha value in the range 0..1. */
export type AlphaChannel = Brand<number, 'AlphaChannel'>;

/** `u8` RGB channel in the range 0..255. */
export type RgbChannel = Brand<number, 'RgbChannel'>;

/** `f32` normalized channel in the range 0..1. */
export type NormalizedChannel = Brand<number, 'NormalizedChannel'>;

/** `f32` hue angle in degrees; neutral colors may use `NaN`. */
export type HueDegrees = Brand<number, 'HueDegrees'>;

/** `f32` chroma value for polar color spaces such as LCh and Oklch. */
export type PolarColorChroma = Brand<number, 'PolarColorChroma'>;

/** `f32` CIELab lightness in the range 0..100. */
export type LabLightness = Brand<number, 'LabLightness'>;

/** `f32` opponent-axis value for Lab and Oklab coordinates. */
export type LabAxis = Brand<number, 'LabAxis'>;

/** `f32` Oklab lightness in the range 0..1. */
export type OklabLightness = Brand<number, 'OklabLightness'>;

/** `f32` percentage-style channel in the range 0..100. */
export type PercentageChannel = Brand<number, 'PercentageChannel'>;

/** `f32` angle in radians used for trig-based interpolation. */
export type RadianAngle = Brand<number, 'RadianAngle'>;

/** `f32` relative weight used when averaging multiple colors. */
export type NormalizedWeight = Brand<number, 'NormalizedWeight'>;

/** `f32` mix/interpolation factor in the range 0..1. */
export type BlendFactor = Brand<number, 'BlendFactor'>;

/** `f32` relative luminance in the range 0..1. */
export type LuminanceValue = Brand<number, 'LuminanceValue'>;

/** `f32` WCAG contrast ratio between two colors. */
export type ContrastRatio = Brand<number, 'ContrastRatio'>;

/** `f32` Delta E 2000 color difference. */
export type DeltaEValue = Brand<number, 'DeltaEValue'>;

/** `f32` Euclidean distance in a chosen color space. */
export type ColorDistanceValue = Brand<number, 'ColorDistanceValue'>;

/** `u32` color temperature in Kelvin. */
export type ColorTemperatureKelvin = Brand<number, 'ColorTemperatureKelvin'>;

/** `u32` packed RGB integer in the range `0x000000..0xffffff`. */
export type RgbHexNumber = Brand<number, 'RgbHexNumber'>;

type ModeChannelMap = {
  cmyk: 'c' | 'm' | 'y' | 'k';
  gl: 'r' | 'g' | 'b' | 'a';
  hcg: 'h' | 'c' | 'g';
  hcl: 'h' | 'c' | 'l';
  hsi: 'h' | 's' | 'i';
  hsl: 'h' | 's' | 'l';
  hsv: 'h' | 's' | 'v';
  lab: 'l' | 'a' | 'b';
  lch: 'l' | 'c' | 'h';
  oklab: 'l' | 'a' | 'b';
  oklch: 'l' | 'c' | 'h';
  rgb: 'r' | 'g' | 'b';
  rgba: 'r' | 'g' | 'b' | 'a';
};

export type ModeChannel =
  | ColorSpaceName
  | {
      [Mode in keyof ModeChannelMap]: `${Mode}.${ModeChannelMap[Mode]}`;
    }[keyof ModeChannelMap];

export type ScaleOutputName =
  | 'alpha'
  | 'brighten'
  | 'cmyk'
  | 'css'
  | 'darken'
  | 'desaturate'
  | 'gl'
  | 'hcl'
  | 'hex'
  | 'hsi'
  | 'hsl'
  | 'hsv'
  | 'lab'
  | 'lch'
  | 'luminance'
  | 'name'
  | 'num'
  | 'oklab'
  | 'oklch'
  | 'rgb'
  | 'rgba'
  | 'saturate'
  | 'temperature';

export type ColorChannelOutput = ColorSpaces[keyof ColorSpaces];

export type ColorChannelInput =
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | readonly [number, number, number, number, number];

export type ColorOutputValue = Color | number | string | ColorChannelOutput;

export type ColorChannelArray = number[] & {
  _clipped?: boolean;
  _unclipped?: number[];
};

export type ColorInputObject = Record<string, number | undefined>;

export type ColorValue = string | number | Color | ColorChannelInput | ColorInputObject;
export type ParserColorValue = Exclude<ColorValue, Color>;

export type ScaleInput = ColorBrewerName | readonly ColorValue[] | ((t: number) => Color);

export type ColorArguments =
  | [ColorValue]
  | [string, string?]
  | [number, string?]
  | [ColorChannelInput, string?]
  | [number, number, number, string?]
  | [number, number, number, number, string?];

export type ParserColorArguments =
  | [ParserColorValue]
  | [string, string?]
  | [number, string?]
  | [ColorChannelInput, string?]
  | [number, number, number, string?]
  | [number, number, number, number, string?];

export type InputFormatHandler = (...args: ParserColorArguments) => ColorChannelArray;

export type InputAutodetectHandler = {
  p: AutodetectPriority;
  test: (...args: ParserColorArguments) => InputFormatName | undefined;
};

export type InputRegistry = {
  format: Record<InputFormatName, InputFormatHandler>;
  autodetect: InputAutodetectHandler[];
  sorted?: boolean;
};

export type Interpolator = (col1: Color, col2: Color, f: number) => Color;

export type InterpolatorRegistry = Record<RegisteredInterpolatorMode, Interpolator>;

/**
 * Scale function returned by `chroma.scale()` and `Color.scale()`.
 */
export type Scale = {
  (value: number | null | undefined): ColorOutputValue;
  /** Sets the scale classes or returns the current class breaks. */
  classes: (classes?: number | number[]) => number[] | false | Scale;
  /** Sets the numeric input domain or returns the current domain. */
  domain: (domain?: number[]) => number[] | Scale;
  /** Sets the interpolation mode or returns the current mode. */
  mode: (mode?: InterpolationMode) => InterpolationMode | Scale;
  range: (colors: ScaleInput) => Scale;
  /** Sets the output format used when calling the scale. */
  out: (output: ScaleOutputName | false) => Scale;
  spread: (value?: number) => number | Scale;
  correctLightness: (enabled?: boolean) => Scale;
  padding: (padding?: number | number[]) => [number, number] | Scale;
  /**
   * Returns sampled colors from the scale. With no count, returns the original palette.
   */
  colors: (count?: number, output?: ScaleOutputName) => ColorOutputValue[];
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
