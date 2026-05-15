import { Color } from '../color';
import type {
  BlendFactor,
  ColorOutputValue,
  ColorValue,
  InterpolationMode,
  ScaleInput,
  ScaleOutputName
} from '../types';

const { pow } = Math;

type ColorGetter = (value: number | null | undefined) => ColorOutputValue;
type LightnessReader = () => [number, number, number];
type ColorOutputReader = () => ColorOutputValue;
type ScalePalette = Color[] | ((t: number) => Color);
type ScaleFunction = ColorGetter & {
  classes: (classes?: number | number[]) => number[] | false | ScaleFunction;
  domain: (domain?: number[]) => number[] | ScaleFunction;
  mode: (mode?: InterpolationMode) => InterpolationMode | ScaleFunction;
  range: (colors: ScaleInput) => ScaleFunction;
  out: (output: ScaleOutputName | false) => ScaleFunction;
  spread: (value?: number) => number | ScaleFunction;
  correctLightness: (enabled?: boolean) => ScaleFunction;
  padding: (padding?: number | number[]) => [number, number] | ScaleFunction;
  colors: (count?: number, output?: ScaleOutputName) => ColorOutputValue[];
  cache: (enabled?: boolean) => boolean | ScaleFunction;
  gamma: (value?: number) => number | ScaleFunction;
  nodata: (value?: ColorValue) => Color | ScaleFunction;
};

function ensureColor(value: ColorValue | Color): Color {
  return value instanceof Color ? value : new Color(value);
}

function readLab(color: Color): [number, number, number] {
  const lab = color.lab;
  if (typeof lab !== 'function') {
    throw new Error('Missing lab reader');
  }

  return (lab as LightnessReader).call(color);
}

function callColorOutput(color: Color, output: ScaleOutputName): ColorOutputValue {
  const reader = color[output];
  if (typeof reader !== 'function') {
    return color;
  }

  return (reader as ColorOutputReader).call(color);
}

function range(left: number, right: number, inclusive: boolean): number[] {
  const values: number[] = [];
  const ascending = left < right;
  const end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let index = left; ascending ? index < end : index > end; ascending ? (index += 1) : (index -= 1)) {
    values.push(index);
  }
  return values;
}

/**
 * Creates a continuous color scale or a scale from a named ColorBrewer palette.
 *
 * The returned function maps numeric input values to colors and exposes helpers for interpolation mode,
 * output formatting, class breaks, gamma correction, and more.
 */
export function scale(colors?: ScaleInput): ScaleFunction {
  let mode: InterpolationMode = 'rgb';
  let noDataColor = new Color('#ccc');
  let spread = 0;
  let domain = [0, 1];
  let positions: number[] = [];
  let padding: [number, number] = [0, 0];
  let classes: number[] | false = false;
  let palette: ScalePalette = [];
  let output: ScaleOutputName | false = false;
  let min = 0;
  let max = 1;
  let correctLightness = false;
  let colorCache: Record<number, Color> = {};
  let useCache = true;
  let gamma = 1;
  let mapLightness = (t: number) => t;
  let mapDomain = (t: number) => t;

  const resetCache = () => {
    colorCache = {};
  };

  const setColors = (nextColors?: ScaleInput): ScalePalette => {
    if (typeof nextColors === 'function') {
      palette = nextColors;
      resetCache();
      return palette;
    }

    let resolvedColors = nextColors ?? ['#fff', '#000'];
    if (typeof resolvedColors === 'string') {
      const brewerPalettes = Color.brewer as Record<string, readonly ColorValue[]>;
      const brewer = brewerPalettes[resolvedColors.toLowerCase()];
      if (brewer != null) {
        resolvedColors = brewer;
      }
    }

    if (!Array.isArray(resolvedColors)) {
      palette = [];
      resetCache();
      return palette;
    }

    const colorList = resolvedColors.length === 1 ? [resolvedColors[0], resolvedColors[0]] : [...resolvedColors];
    palette = colorList.map((color) => ensureColor(color));
    positions = palette.map((_, index) => index / Math.max(palette.length - 1, 1));
    resetCache();
    return palette;
  };

  const getClass = (value: number): number => {
    if (!classes || classes.length === 0) {
      return 0;
    }

    const length = classes.length - 1;
    let index = 0;
    while (index < length && value >= (classes[index] ?? Number.POSITIVE_INFINITY)) {
      index += 1;
    }
    return index - 1;
  };

  const getColor = (value: number | null | undefined, bypassMap = false): Color => {
    if (value == null || Number.isNaN(value)) {
      return noDataColor;
    }

    let t = bypassMap
      ? value
      : classes && classes.length > 2
        ? getClass(value) / (classes.length - 2)
        : max !== min
          ? (value - min) / (max - min)
          : 1;

    t = mapDomain(t);
    if (!bypassMap) {
      t = mapLightness(t);
    }
    if (gamma !== 1) {
      t = pow(t, gamma);
    }

    t = padding[0] + t * (1 - padding[0] - padding[1]);
    t = Math.min(1, Math.max(0, t));

    const cacheKey = Math.floor(t * 10000);
    const cached = colorCache[cacheKey];
    if (useCache && cached != null) {
      return cached;
    }

    let color = noDataColor;
    if (Array.isArray(palette)) {
      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index] ?? 0;
        if (t <= position || index === positions.length - 1) {
          color = palette[index] ?? noDataColor;
          break;
        }

        const nextPosition = positions[index + 1];
        if (nextPosition != null && t > position && t < nextPosition) {
          const localT = (t - position) / (nextPosition - position);
          color = Color.interpolate(
            palette[index] ?? noDataColor,
            palette[index + 1] ?? noDataColor,
            toBlendFactor(localT),
            mode
          );
          break;
        }
      }
    } else {
      color = palette(t);
    }

    if (useCache) {
      colorCache[cacheKey] = color;
    }
    return color;
  };

  setColors(colors);

  const scaleFunction = ((value: number | null | undefined): ColorOutputValue => {
    const color = ensureColor(getColor(value));
    return output ? callColorOutput(color, output) : color;
  }) as ScaleFunction;

  /** Switches the scale into discrete classes. Passing a number computes equidistant classes. */
  scaleFunction.classes = (nextClasses?: number | number[]) => {
    if (nextClasses == null) {
      return classes;
    }

    if (Array.isArray(nextClasses)) {
      classes = [...nextClasses];
      domain = [classes[0] ?? 0, classes[classes.length - 1] ?? 1];
      return scaleFunction;
    }

    const analyzed = Color.analyze(domain);
    classes = nextClasses === 0 ? [analyzed.min, analyzed.max] : Color.limits(analyzed, 'e', nextClasses);
    return scaleFunction;
  };

  /** Sets the numeric input domain for the scale. */
  scaleFunction.domain = (nextDomain?: number[]) => {
    if (nextDomain == null) {
      return domain;
    }

    min = nextDomain[0] ?? 0;
    max = nextDomain[nextDomain.length - 1] ?? min;
    positions = [];
    const paletteSize = Array.isArray(palette) ? palette.length : 0;
    if (nextDomain.length === paletteSize && min !== max) {
      positions = nextDomain.map((value) => (value - min) / (max - min));
    } else {
      positions = Array.from({ length: paletteSize }, (_, index) => index / Math.max(paletteSize - 1, 1));
      if (nextDomain.length > 2) {
        const targetOutputs = nextDomain.map((_, index) => index / (nextDomain.length - 1));
        const targetBreaks = nextDomain.map((value) => (value - min) / (max - min));
        if (!targetBreaks.every((value, index) => targetOutputs[index] === value)) {
          mapDomain = (t: number) => {
            if (t <= 0 || t >= 1) {
              return t;
            }

            let index = 0;
            while (t >= (targetBreaks[index + 1] ?? Number.POSITIVE_INFINITY)) {
              index += 1;
            }

            const leftBreak = targetBreaks[index] ?? 0;
            const rightBreak = targetBreaks[index + 1] ?? 1;
            const fraction = (t - leftBreak) / (rightBreak - leftBreak);
            return (
              (targetOutputs[index] ?? 0) + fraction * ((targetOutputs[index + 1] ?? 1) - (targetOutputs[index] ?? 0))
            );
          };
        }
      }
    }

    domain = [min, max];
    return scaleFunction;
  };

  /** Sets the interpolation mode used between colors. */
  scaleFunction.mode = (nextMode?: InterpolationMode) => {
    if (nextMode == null) {
      return mode;
    }

    mode = nextMode as InterpolationMode;
    resetCache();
    return scaleFunction;
  };

  /**
   * Replaces the scale palette.
   *
   * This accepts explicit colors, a named ColorBrewer palette, or a custom sampler function.
   */
  scaleFunction.range = (nextColors: ScaleInput) => {
    setColors(nextColors);
    return scaleFunction;
  };

  /** Sets the output format returned by the scale function. Pass `false` to return `Color` objects. */
  scaleFunction.out = (nextOutput: ScaleOutputName | false) => {
    output = nextOutput;
    return scaleFunction;
  };

  /**
   * Sets or reads the internal spread value used by some downstream consumers.
   */
  scaleFunction.spread = (value?: number) => {
    if (value == null) {
      return spread;
    }

    spread = value;
    return scaleFunction;
  };

  /** Enables lightness correction so interpolation stays more perceptually uniform. */
  scaleFunction.correctLightness = (enabled = true) => {
    correctLightness = enabled;
    resetCache();
    if (!correctLightness) {
      mapLightness = (t) => t;
      return scaleFunction;
    }

    mapLightness = (t) => {
      const l0 = readLab(getColor(0, true))[0];
      const l1 = readLab(getColor(1, true))[0];
      const inverse = l0 > l1;
      let actual = readLab(getColor(t, true))[0];
      const ideal = l0 + (l1 - l0) * t;
      let diff = actual - ideal;
      let left = 0;
      let right = 1;
      let iterations = 20;
      while (Math.abs(diff) > 1e-2 && iterations-- > 0) {
        if (inverse) {
          diff *= -1;
        }

        if (diff < 0) {
          left = t;
          t += (right - t) * 0.5;
        } else {
          right = t;
          t += (left - t) * 0.5;
        }

        actual = readLab(getColor(t, true))[0];
        diff = actual - ideal;
      }

      return t;
    };

    return scaleFunction;
  };

  /** Adds symmetric or asymmetric padding at the low and high ends of the scale. */
  scaleFunction.padding = (nextPadding?: number | number[]) => {
    if (nextPadding == null) {
      return padding;
    }

    padding = typeof nextPadding === 'number' ? [nextPadding, nextPadding] : [nextPadding[0] ?? 0, nextPadding[1] ?? 0];
    return scaleFunction;
  };

  /** Returns sampled colors from the scale. With no count, it returns the underlying palette. */
  scaleFunction.colors = (count?: number, nextOutput: ScaleOutputName = 'hex') => {
    let result: ColorOutputValue[];
    if (count == null) {
      result = Array.isArray(palette) ? [...palette] : [];
    } else if (count === 1) {
      result = [scaleFunction(0.5)];
    } else if (count > 1) {
      const domainMin = domain[0] ?? 0;
      const domainDelta = (domain[1] ?? domainMin) - domainMin;
      result = range(0, count, false).map((index) => scaleFunction(domainMin + (index / (count - 1)) * domainDelta));
    } else {
      const classBreaks = Array.isArray(classes) ? classes : undefined;
      const samples =
        classBreaks != null && classBreaks.length > 2
          ? range(1, classBreaks.length, false).map(
              (index) => ((classBreaks[index - 1] ?? 0) + (classBreaks[index] ?? 0)) * 0.5
            )
          : domain;
      result = samples.map((value) => scaleFunction(value));
    }

    return nextOutput
      ? result.map((value) => (value instanceof Color ? callColorOutput(value, nextOutput) : value))
      : result;
  };

  /** Enables or disables internal caching for repeated lookups. */
  scaleFunction.cache = (enabled?: boolean) => {
    if (enabled == null) {
      return useCache;
    }

    useCache = enabled;
    return scaleFunction;
  };

  /** Sets the gamma curve used when mapping scale positions. */
  scaleFunction.gamma = (value?: number) => {
    if (value == null) {
      return gamma;
    }

    gamma = value;
    return scaleFunction;
  };

  /**
   * Sets the fallback color returned for `null`, `undefined`, or `NaN` inputs.
   */
  scaleFunction.nodata = (value?: ColorValue) => {
    if (value == null) {
      return noDataColor;
    }

    noDataColor = ensureColor(value);
    return scaleFunction;
  };

  return scaleFunction;
}

function toBlendFactor(value: number): BlendFactor {
  return value as BlendFactor;
}
