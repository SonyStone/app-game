import { colorbrewer } from './colors/colorbrewer';
import type { NamedColorName } from './colors/w3cx11';
import { w3cx11Entries } from './colors/w3cx11';
import { average } from './generator/average';
import { bezier } from './generator/bezier';
import type { BlendMode } from './generator/blend';
import { blend } from './generator/blend';
import { cubehelix } from './generator/cubehelix';
import { mix as mixColors } from './generator/mix';
import { randomColor } from './generator/random';
import { scale as createScale } from './generator/scale';
import { rgb2cmyk } from './io/cmyk/rgb2cmyk';
import { rgb2css } from './io/css/rgb2css';
import { formatParsers, glToRgb } from './io/format-parsers';
import { rgb2hcg } from './io/hcg/rgb2hcg';
import { rgb2hex } from './io/hex/rgb2hex';
import { rgb2hsi } from './io/hsi/rgb2hsi';
import { rgb2hsl } from './io/hsl/rgb2hsl';
import { rgb2hsv } from './io/hsv/rgb2hsv';
import { input } from './io/input';
import { LAB_CONSTANTS } from './io/lab/lab-constants';
import { rgb2lab } from './io/lab/rgb2lab';
import { rgb2lch } from './io/lch/rgb2lch';
import { rgb2num } from './io/num/rgb2num';
import { rgb2oklab } from './io/oklab/rgb2oklab';
import { rgb2oklch } from './io/oklch/rgb2oklch';
import { rgb2temperature } from './io/temp/rgb2temperature';
import type {
  AlphaChannel,
  BlendFactor,
  ColorArguments,
  ColorChannelArray,
  ColorChannelInput,
  ColorSpaceName,
  ColorSpaces,
  ColorTemperatureKelvin,
  ColorValue,
  CssColorString,
  CssMode,
  FactoryColorSpaceName,
  HexMode,
  HexString,
  HueDegrees,
  InputFormatName,
  InterpolationMode,
  LabAxis,
  LabLightness,
  LuminanceValue,
  ModeChannel,
  NormalizedChannel,
  OklabLightness,
  ParserColorArguments,
  PercentageChannel,
  PolarColorChroma,
  RgbChannel,
  RgbHexNumber,
  Scale,
  ScaleInput
} from './types';
import { clip_rgb, last } from './utils';
import { analyze, limits } from './utils/analyze';
import { contrast } from './utils/contrast';
import { deltaE } from './utils/delta-e';
import { distance } from './utils/distance';
import { scales } from './utils/scales';
import { valid } from './utils/valid';

type GlInput = { r: NormalizedChannel; g: NormalizedChannel; b: NormalizedChannel; a?: AlphaChannel };

/**
 * Callable constructor surface shared by `Color` and the public `chroma(...)` factory.
 */
export type ColorFactoryCallable = {
  (color: string | number | Color): Color;
  (a: number, b: number, c: number, colorSpace?: FactoryColorSpaceName): Color;
  (a: number, b: number, c: number, d: number, colorSpace?: FactoryColorSpaceName): Color;
  (values: ColorChannelInput, colorSpace?: FactoryColorSpaceName): Color;
};

/** Constructor and static helper surface exposed as `chroma.Color`. */
export type ColorConstructor = typeof Color;

/**
 * Public callable `chroma` API assembled from `Color`.
 */
export type ChromaStatic = ColorFactoryCallable & {
  Color: ColorConstructor;
  version: string;
  analyze: typeof analyze;
  average: typeof average;
  bezier: typeof bezier;
  blend: (color1: ColorValue, color2: ColorValue, blendMode: BlendMode) => Color;
  brewer: typeof colorbrewer;
  cmyk: (c: NormalizedChannel, m: NormalizedChannel, y: NormalizedChannel, k: NormalizedChannel) => Color;
  contrast: typeof contrast;
  css: (col: CssColorString) => Color;
  cubehelix: typeof cubehelix;
  deltaE: typeof deltaE;
  distance: typeof distance;
  gl: typeof Color.gl;
  hcg: (h: HueDegrees, c: PercentageChannel, g: PercentageChannel, alpha?: AlphaChannel) => Color;
  hcl: (h: HueDegrees, c: PolarColorChroma, l: LabLightness, alpha?: AlphaChannel) => Color;
  hex: (color: HexString) => Color;
  hsi: (h: HueDegrees, s: NormalizedChannel, i: NormalizedChannel, alpha?: AlphaChannel) => Color;
  hsl: (h: HueDegrees, s: NormalizedChannel, l: NormalizedChannel, alpha?: AlphaChannel) => Color;
  hsv: (h: HueDegrees, s: NormalizedChannel, v: NormalizedChannel, alpha?: AlphaChannel) => Color;
  interpolate: (color1: ColorValue, color2: ColorValue, f?: BlendFactor, colorSpace?: InterpolationMode) => Color;
  kelvin: (t: ColorTemperatureKelvin) => Color;
  lab: (lightness: LabLightness, a: LabAxis, b: LabAxis, alpha?: AlphaChannel) => Color;
  lch: (l: LabLightness, c: PolarColorChroma, h: HueDegrees, alpha?: AlphaChannel) => Color;
  limits: typeof limits;
  mix: (color1: ColorValue, color2: ColorValue, f?: BlendFactor, colorSpace?: InterpolationMode) => Color;
  num: (value: RgbHexNumber) => Color;
  oklab: (lightness: OklabLightness, a: LabAxis, b: LabAxis, alpha?: AlphaChannel) => Color;
  oklch: (l: OklabLightness, c: PolarColorChroma, h: HueDegrees, alpha?: AlphaChannel) => Color;
  random: () => Color;
  rgb: (r: RgbChannel, g: RgbChannel, b: RgbChannel, alpha?: AlphaChannel) => Color;
  scale: (colors?: ScaleInput) => Scale;
  scales: typeof scales;
  temp: (t: ColorTemperatureKelvin) => Color;
  temperature: (t: ColorTemperatureKelvin) => Color;
  valid: typeof valid;
};

type ColorFactory = ChromaStatic;

/**
 * Runtime color object and the owning home for the public chroma factory helpers.
 */
export class Color {
  [key: string]: unknown;
  /**
   * Internal RGBA storage. RGB channels are floats and alpha is normalized to 0..1.
   */
  _rgb!: ColorChannelArray;

  static createFactory(version: string): ChromaStatic {
    const createColor = (...args: ColorArguments) => new Color(...args);
    return Object.assign(
      createColor,
      {
        Color,
        version
      },
      {
        analyze: Color.analyze,
        average: Color.average,
        bezier: Color.bezier,
        blend: Color.blend,
        brewer: Color.brewer,
        cmyk: Color.cmyk,
        contrast: Color.contrast,
        css: Color.css,
        cubehelix: Color.cubehelix,
        deltaE: Color.deltaE,
        distance: Color.distance,
        gl: Color.gl,
        hcg: Color.hcg,
        hcl: Color.hcl,
        hex: Color.hex,
        hsi: Color.hsi,
        hsl: Color.hsl,
        hsv: Color.hsv,
        interpolate: Color.interpolate,
        kelvin: Color.kelvin,
        lab: Color.lab,
        lch: Color.lch,
        limits: Color.limits,
        mix: Color.mix,
        num: Color.num,
        oklab: Color.oklab,
        oklch: Color.oklch,
        random: Color.random,
        rgb: Color.rgb,
        scale: Color.scale,
        scales: Color.scales,
        temp: Color.temp,
        temperature: Color.temperature,
        valid: Color.valid
      }
    ) as ColorFactory;
  }

  static readonly analyze = analyze;

  /**
   * Similar to `mix()`, but accepts more than two colors and averages channels across the palette.
   */
  static readonly average = average;

  /**
   * Returns a bezier interpolator in Lab space. Call `.scale()` on the result to get a scale instance.
   */
  static readonly bezier = bezier;

  /** Blends two colors using RGB channel-wise blend functions. */
  static readonly blend = blend;

  /**
   * Included ColorBrewer palettes used by `Color.scale()`.
   */
  static readonly brewer = colorbrewer;

  static cmyk(c: NormalizedChannel, m: NormalizedChannel, y: NormalizedChannel, k: NormalizedChannel): Color {
    return new Color([c, m, y, k], 'cmyk');
  }

  /** Creates a color from a CSS-compatible string. */
  static css(value: CssColorString): Color {
    return new Color(value, 'css');
  }

  /**
   * Computes the WCAG contrast ratio between two colors.
   */
  static readonly contrast = contrast;

  /** Creates a Cubehelix color generator. */
  static readonly cubehelix = cubehelix;

  /**
   * Computes CMC color difference between two colors.
   */
  static readonly deltaE = deltaE;

  /**
   * Computes the euclidean distance between two colors in a given color space.
   */
  static readonly distance = distance;

  static hcg(h: HueDegrees, c: PercentageChannel, g: PercentageChannel, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [h, c, g] : [h, c, g, alpha], 'hcg');
  }

  static hsi(h: HueDegrees, s: NormalizedChannel, i: NormalizedChannel, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [h, s, i] : [h, s, i, alpha], 'hsi');
  }

  static hsl(h: HueDegrees, s: NormalizedChannel, l: NormalizedChannel, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [h, s, l] : [h, s, l, alpha], 'hsl');
  }

  static hsv(h: HueDegrees, s: NormalizedChannel, v: NormalizedChannel, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [h, s, v] : [h, s, v, alpha], 'hsv');
  }

  /** Creates a color from a hexadecimal string. */
  static hex(value: HexString): Color {
    return new Color(value, 'hex');
  }

  /** Same meaning as `lch()`, but with the components in reverse order. */
  static hcl(h: HueDegrees, c: PolarColorChroma, l: LabLightness, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [h, c, l] : [h, c, l, alpha], 'hcl');
  }

  static lab(lightness: LabLightness, a: LabAxis, b: LabAxis, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [lightness, a, b] : [lightness, a, b, alpha], 'lab');
  }

  static lch(l: LabLightness, c: PolarColorChroma, h: HueDegrees, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [l, c, h] : [l, c, h, alpha], 'lch');
  }

  /** Creates a color from its numeric hexadecimal RGB representation. */
  static num(value: RgbHexNumber): Color {
    return new Color(value, 'num');
  }

  static oklab(lightness: OklabLightness, a: LabAxis, b: LabAxis, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [lightness, a, b] : [lightness, a, b, alpha], 'oklab');
  }

  static oklch(l: OklabLightness, c: PolarColorChroma, h: HueDegrees, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [l, c, h] : [l, c, h, alpha], 'oklch');
  }

  static rgb(r: RgbChannel, g: RgbChannel, b: RgbChannel, alpha?: AlphaChannel): Color {
    return new Color(alpha == null ? [r, g, b] : [r, g, b, alpha], 'rgb');
  }

  /** Returns a random color. */
  static readonly random = randomColor;

  /** Returns a color scale. Named ColorBrewer palettes are resolved automatically. */
  static scale(colors?: ScaleInput): Scale {
    return createScale(colors);
  }

  static readonly scales = scales;

  /** Returns a color from the color temperature scale. */
  static temp(value: ColorTemperatureKelvin): Color {
    return new Color(value, 'temp');
  }

  static kelvin(value: ColorTemperatureKelvin): Color {
    return Color.temp(value);
  }

  /** Alias for `Color.mix()`. */
  static interpolate(
    left: ColorValue,
    right: ColorValue,
    f: BlendFactor = toBlendFactor(0.5),
    colorSpace: InterpolationMode = 'lrgb'
  ): Color {
    return mixColors(left, right, f, colorSpace);
  }

  /** Helper function that computes class breaks based on data. */
  static readonly limits = limits;

  /**
   * Mixes two colors. The mix ratio is a value between 0 and 1.
   *
   * @example
   * chroma.mix('red', 'blue', 0.25) // => #bf0040
   * @example
   * chroma.mix('red', 'blue', 0.5, 'hsl') // => #ff00ff
   */
  static mix(
    left: ColorValue,
    right: ColorValue,
    f: BlendFactor = toBlendFactor(0.5),
    colorSpace: InterpolationMode = 'lrgb'
  ): Color {
    return mixColors(left, right, f, colorSpace);
  }

  /** Returns a color from the color temperature scale. */
  static temperature(value: ColorTemperatureKelvin): Color {
    return Color.temp(value);
  }

  /** Returns whether the provided value can be parsed as a color. */
  static readonly valid = valid;

  /** GL is normalized RGB(A) input where color channels are in the range 0..1. */
  static gl(...args: unknown[]): Color;
  static gl(red: NormalizedChannel, green: NormalizedChannel, blue: NormalizedChannel, alpha?: AlphaChannel): Color;
  static gl(values: readonly [NormalizedChannel, NormalizedChannel, NormalizedChannel] | ColorSpaces['gl']): Color;
  static gl(value: GlInput): Color;
  static gl(...args: unknown[]): Color {
    return new Color(toColorChannelInput(glToRgb(...(args as ParserColorArguments))), 'rgb');
  }

  constructor(...args: ColorArguments) {
    const [firstArgument] = args;
    if (firstArgument instanceof Color) {
      return firstArgument;
    }

    const parserColorArgs = args as ParserColorArguments;

    let mode = last<InputFormatName>(parserColorArgs) ?? undefined;
    let autodetect = false;

    if (mode == null) {
      autodetect = true;
      if (!input.sorted) {
        input.autodetect = [...input.autodetect].sort((left, right) => right.p - left.p);
        input.sorted = true;
      }

      for (const checker of input.autodetect) {
        mode = checker.test(...parserColorArgs);
        if (mode != null) {
          break;
        }
      }
    }

    const parser = mode == null ? undefined : mode === 'named' ? input.format.named : formatParsers[mode];
    if (parser == null) {
      throw new Error(`unknown format: ${args}`);
    }

    const parserArgs = (autodetect ? parserColorArgs : parserColorArgs.slice(0, -1)) as ParserColorArguments;
    this._rgb = clip_rgb(parser(...parserArgs));
    if (this._rgb.length === 3) {
      this._rgb.push(1);
    }
  }

  /** Get and set the color opacity. */
  alpha(): number;
  alpha(value: number, mutate?: boolean): Color;
  alpha(value?: number, mutate = false): Color | number {
    if (typeof value === 'number') {
      if (mutate) {
        this._rgb[3] = value;
        return this;
      }

      return new Color([this._rgb[0] ?? 0, this._rgb[1] ?? 0, this._rgb[2] ?? 0, value], 'rgb');
    }

    return this._rgb[3] ?? 1;
  }

  /**
   * Test if a color has been clipped or not.
   * Colors generated from CIELab may have RGB channels clipped to the displayable 0..255 range.
   *
   * @example
   * chroma.hcl(50, 40, 20).clipped() === true
   */
  clipped(): boolean {
    return this._rgb._clipped ?? false;
  }

  /**
   * Returns an array with the cyan, magenta, yellow, and key components, each normalized to 0..1.
   *
   * @example
   * chroma('orange').cmyk()
   */
  cmyk(): ColorSpaces['cmyk'] {
    return rgb2cmyk(this._rgb);
  }

  /**
   * Returns a RGB() or HSL() string representation that can be used as a CSS color definition.
   * `mode` defaults to `rgb`.
   */
  css(): CssColorString;
  css(mode: CssMode): CssColorString;
  css(mode?: CssMode): CssColorString {
    return rgb2css(this._rgb, mode);
  }

  darken(amount = 1): Color {
    const [lightness, a, b] = this.lab();
    const lab: [number, number, number] = [lightness, a, b];
    lab[0] -= LAB_CONSTANTS.Kn * amount;
    return new Color(lab, 'lab').alpha(this.alpha(), true);
  }

  brighten(amount = 1): Color {
    return this.darken(-amount);
  }

  darker(amount = 1): Color {
    return this.darken(amount);
  }

  brighter(amount = 1): Color {
    return this.brighten(amount);
  }

  /**
   * Returns a single channel value.
   * Also see `set()`.
   */
  get(modeChannel: ModeChannel): number | ColorChannelInput {
    const [mode, channel] = modeChannel.split('.') as [ColorSpaceName, string?];
    const source = this.readModeValues(mode);
    if (channel == null) {
      return source;
    }

    const index = mode.indexOf(channel) - (mode.startsWith('ok') ? 2 : 0);
    if (index > -1) {
      return source[index] ?? Number.NaN;
    }

    throw new Error(`unknown channel ${channel} in mode ${mode}`);
  }

  /** Returns hue, chroma, and grayness for the color. */
  hcg(): ColorSpaces['hcg'] {
    return rgb2hcg(this._rgb);
  }

  /**
   * Returns hue, saturation, and intensity.
   *
   * @example
   * chroma('orange').hsi() === [39.64, 1, 0.55]
   */
  hsi(): ColorSpaces['hsi'] {
    return rgb2hsi(this._rgb);
  }

  /**
   * Returns hue, saturation, and lightness.
   *
   * @example
   * chroma('orange').hsl() === [38.82, 1, 0.5]
   */
  hsl(): ColorSpaces['hsl'] {
    return toHslChannels(rgb2hsl(this._rgb));
  }

  /**
   * Returns hue, saturation, and value.
   *
   * @example
   * chroma('orange').hsv() === [38.82, 1, 1]
   */
  hsv(): ColorSpaces['hsv'] {
    return rgb2hsv(this._rgb[0] ?? 0, this._rgb[1] ?? 0, this._rgb[2] ?? 0);
  }

  /**
   * Get color as hexadecimal string.
   *
   * @param mode `auto` includes alpha only when it is less than 1.
   * `rgb` omits alpha.
   * `rgba` always includes alpha.
   *
   * @example
   * chroma('orange').hex() === '#ffa500'
   * @example
   * chroma('orange').alpha(0.5).hex() === '#ffa50080'
   * @example
   * chroma('orange').alpha(0.5).hex('rgb') === '#ffa500'
   */
  hex(mode?: HexMode): HexString {
    return rgb2hex(this._rgb, mode);
  }

  /**
   * Alias of `lch()` with the components in reverse order.
   *
   * @example
   * chroma('skyblue').hcl() === [235.11, 25.94, 79.21]
   */
  hcl(): ColorSpaces['hcl'] {
    return toHclChannels(rgb2lch(this._rgb));
  }

  /** Alias for `mix()` on the instance. */
  interpolate(color: ColorValue, f: BlendFactor = toBlendFactor(0.5), colorSpace: InterpolationMode = 'lrgb'): Color {
    return mixColors(this, color, f, colorSpace);
  }

  kelvin(): ColorTemperatureKelvin {
    return this.temperature();
  }

  /**
   * Returns Lab coordinates.
   *
   * @example
   * chroma('orange').lab() === [74.94, 23.93, 78.95]
   */
  lab(): ColorSpaces['lab'] {
    return rgb2lab(this._rgb);
  }

  /**
   * Returns lightness, chroma, and hue.
   *
   * @example
   * chroma('skyblue').lch() === [79.21, 25.94, 235.11]
   */
  lch(): ColorSpaces['lch'] {
    return rgb2lch(this._rgb);
  }

  /**
   * Relative brightness, according to the WCAG luminance definition.
   * When a value is provided, the color is interpolated with black or white until the requested luminance is found.
   */
  luminance(): LuminanceValue;
  luminance(value: LuminanceValue, colorSpace?: InterpolationMode): Color;
  luminance(value?: LuminanceValue, colorSpace?: InterpolationMode): LuminanceValue | Color {
    void colorSpace;
    if (typeof value === 'number') {
      if (value === 0) {
        return new Color([0, 0, 0, this.alpha()], 'rgb');
      }

      if (value === 1) {
        return new Color([255, 255, 255, this.alpha()], 'rgb');
      }

      const currentLuminance = this.luminance();
      let maxIterations = 20;
      const test = (low: Color, high: Color): Color => {
        const mid = low.interpolate(high, toBlendFactor(0.5), 'rgb');
        const midLuminance = mid.luminance();

        if (Math.abs(value - midLuminance) < 1e-7 || maxIterations-- <= 0) {
          return mid;
        }

        return midLuminance > value ? test(low, mid) : test(mid, high);
      };

      const result =
        currentLuminance > value ? test(new Color([0, 0, 0]), this) : test(this, new Color([255, 255, 255]));
      return new Color([...result.rgb(), this.alpha()], 'rgb');
    }

    return toLuminanceValue(rgb2luminance(this._rgb[0] ?? 0, this._rgb[1] ?? 0, this._rgb[2] ?? 0));
  }

  /** Mixes the current color with another color using the requested interpolation mode. */
  mix(color: ColorValue, f: BlendFactor = toBlendFactor(0.5), colorSpace: InterpolationMode = 'lrgb'): Color {
    return mixColors(this, color, f, colorSpace);
  }

  /** Returns the named color when one exists, otherwise falls back to a hexadecimal string. */
  name(): NamedColorName | HexString {
    const hex = rgb2hex(this._rgb, 'rgb');
    for (const [name, value] of w3cx11Entries) {
      if (value === hex) {
        return name;
      }
    }

    return hex;
  }

  /**
   * Returns the numeric representation of the hexadecimal RGB color.
   *
   * @example
   * chroma('#000000').num() === 0
   * @example
   * chroma('#0000ff').num() === 255
   */
  num(): RgbHexNumber {
    return rgb2num(this._rgb);
  }

  /**
   * Returns Oklab coordinates.
   *
   * @example
   * chroma('orange').oklab() === [0.7927, 0.0566, 0.1614]
   */
  oklab(): ColorSpaces['oklab'] {
    return rgb2oklab(this._rgb);
  }

  /**
   * Returns Oklch coordinates.
   *
   * @example
   * chroma('skyblue').oklch() === [0.8148, 0.0819, 225.8]
   */
  oklch(): ColorSpaces['oklch'] {
    return rgb2oklch(this._rgb);
  }

  premultiply(mutate = false): Color {
    const alpha = this.alpha();
    const premultiplied = [
      (this._rgb[0] ?? 0) * alpha,
      (this._rgb[1] ?? 0) * alpha,
      (this._rgb[2] ?? 0) * alpha,
      alpha
    ];
    if (mutate) {
      this._rgb = premultiplied;
      return this;
    }

    return new Color(toColorChannelInput(premultiplied), 'rgb');
  }

  /**
   * Returns RGB channel values in the range 0..255.
   * Channels are rounded by default; pass `false` to preserve internal floats.
   *
   * @example
   * chroma('orange').rgb() === [255, 165, 0]
   */
  rgb(shouldRound = true): ColorSpaces['rgb'] {
    const values = this._rgb.slice(0, 3);
    return toRgbChannels(shouldRound ? values.map((value) => Math.round(value)) : values);
  }

  /**
   * Just like `rgb()` but adds the alpha channel.
   *
   * @example
   * chroma('orange').rgba() === [255, 165, 0, 1]
   */
  rgba(shouldRound = true): ColorSpaces['rgba'] {
    return toRgbaChannels(
      this._rgb.slice(0, 4).map((value, index) => (index < 3 && shouldRound ? Math.round(value) : value))
    );
  }

  /**
   * Returns normalized RGB(A) channel values in the range 0..1.
   *
   * @example
   * chroma('33cc00').gl() === [0.2, 0.8, 0, 1]
   */
  gl(): ColorSpaces['gl'] {
    return toGlChannels([
      (this._rgb[0] ?? 0) / 255,
      (this._rgb[1] ?? 0) / 255,
      (this._rgb[2] ?? 0) / 255,
      this._rgb[3] ?? 1
    ]);
  }

  /** Changes the saturation of a color by manipulating the Lch chroma channel. */
  saturate(amount = 1): Color {
    const [lightness, chroma, hue] = this.lch();
    const lch: [number, number, number] = [lightness, chroma, hue];
    lch[1] += LAB_CONSTANTS.Kn * amount;
    if (lch[1] < 0) {
      lch[1] = 0;
    }

    return new Color(lch, 'lch').alpha(this.alpha(), true);
  }

  /** Similar to `saturate()`, but in the opposite direction. */
  desaturate(amount = 1): Color {
    return this.saturate(-amount);
  }

  /**
   * Changes a single channel and returns a new color unless `mutate` is true.
   *
   * @example
   * chroma('orangered').set('lab.l', '*0.5')
   * @example
   * chroma('darkseagreen').set('lch.c', '*2')
   */
  set(modeChannel: ModeChannel, value: number | string, mutate?: false): Color;
  set(modeChannel: ModeChannel, value: number | string, mutate: true): Color;
  set(modeChannel: ModeChannel, value: number | string, mutate: boolean): Color;
  set(modeChannel: ModeChannel, value: number | string, mutate = false): Color {
    const [mode, channel] = modeChannel.split('.') as [ColorSpaceName, string?];
    const source = [...this.readModeValues(mode)];
    if (channel == null) {
      return new Color(toColorChannelInput(source), mode);
    }

    const index = mode.indexOf(channel) - (mode.startsWith('ok') ? 2 : 0);
    if (index <= -1) {
      throw new Error(`unknown channel ${channel} in mode ${mode}`);
    }

    source[index] = resolveChannelValue(source[index] ?? 0, value);
    const output = new Color(toColorChannelInput(source), mode);
    if (mutate) {
      this._rgb = output._rgb;
      return this;
    }

    return output;
  }

  temp(): ColorTemperatureKelvin {
    return this.temperature();
  }

  /**
   * Estimates the temperature in Kelvin for colors from the temperature gradient.
   */
  temperature(): ColorTemperatureKelvin {
    return rgb2temperature(this._rgb);
  }

  toString(): string {
    return this.hex();
  }

  private readModeValues(mode: ColorSpaceName): ColorChannelInput {
    const reader = this[mode];
    if (typeof reader !== 'function') {
      throw new Error(`unknown mode ${mode}`);
    }

    return toColorChannelInput((reader as () => readonly number[]).call(this));
  }
}

function toColorChannelInput(values: readonly number[]): ColorChannelInput {
  if (values.length === 3) {
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
  }

  if (values.length === 4) {
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
  }

  if (values.length === 5) {
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0];
  }

  throw new Error(`Unsupported channel input length: ${values.length}`);
}

function resolveChannelValue(previousValue: number, value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }

  switch (value.charAt(0)) {
    case '+':
    case '-':
      return previousValue + Number(value);
    case '*':
      return previousValue * Number(value.slice(1));
    case '/':
      return previousValue / Number(value.slice(1));
    default:
      return Number(value);
  }
}

function toBlendFactor(value: number): BlendFactor {
  return value as BlendFactor;
}

function toHclChannels(value: ColorSpaces['lch']): ColorSpaces['hcl'] {
  const [lightness, chroma, hue] = value;
  return [hue, chroma, lightness];
}

function toGlChannels(value: readonly number[]): ColorSpaces['gl'] {
  const [red = 0, green = 0, blue = 0, alpha = 1] = value;
  return [red as NormalizedChannel, green as NormalizedChannel, blue as NormalizedChannel, alpha as AlphaChannel];
}

function toHslChannels(value: ColorSpaces['hsl'] | [...ColorSpaces['hsl'], AlphaChannel]): ColorSpaces['hsl'] {
  const [hue, saturation, lightness] = value;
  return [hue, saturation, lightness];
}

function toRgbChannels(value: readonly number[]): ColorSpaces['rgb'] {
  const [red = 0, green = 0, blue = 0] = value;
  return [red as RgbChannel, green as RgbChannel, blue as RgbChannel];
}

function toRgbaChannels(value: readonly number[]): ColorSpaces['rgba'] {
  const [red = 0, green = 0, blue = 0, alpha = 1] = value;
  return [red as RgbChannel, green as RgbChannel, blue as RgbChannel, alpha as AlphaChannel];
}

function toLuminanceValue(value: number): LuminanceValue {
  return value as LuminanceValue;
}

function rgb2luminance(r: number, g: number, b: number): number {
  return 0.2126 * luminanceChannel(r) + 0.7152 * luminanceChannel(g) + 0.0722 * luminanceChannel(b);
}

function luminanceChannel(value: number): number {
  const normalizedValue = value / 255;
  return normalizedValue <= 0.03928 ? normalizedValue / 12.92 : Math.pow((normalizedValue + 0.055) / 1.055, 2.4);
}
