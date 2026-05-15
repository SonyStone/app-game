import { Color } from '../color';
import type {
  AlphaChannel,
  ColorChannelInput,
  ColorSpaces,
  ColorValue,
  HueDegrees,
  InterpolationMode,
  NormalizedWeight,
  RadianAngle
} from '../types';
import { clip_rgb } from '../utils';

const { PI, atan2, cos, pow, sin, sqrt } = Math;

type ChannelReadMode = Exclude<InterpolationMode, 'lrgb'>;
type ChannelReader<Mode extends ChannelReadMode = ChannelReadMode> = () => ColorSpaces[Mode];

function readChannels(color: Color, mode: ChannelReadMode): number[] {
  const reader = color[mode];
  if (typeof reader !== 'function') {
    throw new Error(`Missing ${mode} reader`);
  }

  const value = (reader as ChannelReader).call(color);
  if (!Array.isArray(value)) {
    throw new Error(`Mode ${mode} did not return channels`);
  }

  return [...value];
}

function readAlpha(color: Color): AlphaChannel {
  return toAlphaChannel(color.alpha());
}

function writeAlpha(color: Color, value: AlphaChannel): Color {
  return color.alpha(value, true);
}

function ensurePalette(colors: readonly ColorValue[]): Color[] {
  return colors.map((color) => (color instanceof Color ? color : new Color(color)));
}

function averageLrgb(colors: readonly Color[], weights: readonly number[]): Color {
  const xyz = [0, 0, 0, 0];
  const length = colors.length;
  for (let index = 0; index < length; index += 1) {
    const color = colors[index];
    const factor = (weights[index] ?? 0) / length;
    xyz[0] += pow(color._rgb[0] ?? 0, 2) * factor;
    xyz[1] += pow(color._rgb[1] ?? 0, 2) * factor;
    xyz[2] += pow(color._rgb[2] ?? 0, 2) * factor;
    xyz[3] += (color._rgb[3] ?? 1) * factor;
  }

  xyz[0] = sqrt(xyz[0]);
  xyz[1] = sqrt(xyz[1]);
  xyz[2] = sqrt(xyz[2]);
  if (xyz[3] > 0.9999999) {
    xyz[3] = 1;
  }

  return new Color(toColorChannelInput(clip_rgb(xyz)), 'rgb');
}

export function average(
  colors: readonly ColorValue[],
  mode: InterpolationMode = 'lrgb',
  weights?: readonly number[]
): Color {
  const length = colors.length;
  const normalizedWeights: NormalizedWeight[] = (weights == null ? Array.from({ length }, () => 1) : [...weights]).map(
    toNormalizedWeight
  );
  const factor = toNormalizedWeight(length / normalizedWeights.reduce((sum, weight) => sum + weight, 0));
  normalizedWeights.forEach((weight, index) => {
    normalizedWeights[index] = toNormalizedWeight(weight * factor);
  });

  const palette = ensurePalette(colors);
  if (mode === 'lrgb') {
    return averageLrgb(palette, normalizedWeights);
  }

  const [first, ...rest] = palette;
  if (first == null) {
    throw new Error('average requires at least one color');
  }

  const xyz = readChannels(first, mode);
  const counts: number[] = xyz.map((value) => (Number.isNaN(value) ? 0 : (normalizedWeights[0] ?? 0)));
  let dx = 0;
  let dy = 0;

  for (let index = 0; index < xyz.length; index += 1) {
    xyz[index] = (xyz[index] ?? 0) * (normalizedWeights[0] ?? 0);
    if (mode.charAt(index) === 'h' && !Number.isNaN(xyz[index] ?? Number.NaN)) {
      const angle = ((xyz[index] ?? 0) / 180) * PI;
      dx += cos(angle) * (normalizedWeights[0] ?? 0);
      dy += sin(angle) * (normalizedWeights[0] ?? 0);
    }
  }

  let alpha = readAlpha(first) * (normalizedWeights[0] ?? 0);
  rest.forEach((color, colorIndex) => {
    const xyz2 = readChannels(color, mode);
    const weight = normalizedWeights[colorIndex + 1] ?? 0;
    alpha += readAlpha(color) * weight;
    for (let index = 0; index < xyz.length; index += 1) {
      if (!Number.isNaN(xyz2[index] ?? Number.NaN)) {
        counts[index] = (counts[index] ?? 0) + weight;
        if (mode.charAt(index) === 'h') {
          const angle = toRadianAngle(((xyz2[index] ?? 0) / 180) * PI);
          dx += cos(angle) * weight;
          dy += sin(angle) * weight;
        } else {
          xyz[index] = (xyz[index] ?? 0) + (xyz2[index] ?? 0) * weight;
        }
      }
    }
  });

  for (let index = 0; index < xyz.length; index += 1) {
    if (mode.charAt(index) === 'h') {
      let angle = toHueDegrees((atan2(dy / (counts[index] || 1), dx / (counts[index] || 1)) / PI) * 180);
      while (angle < 0) {
        angle = toHueDegrees(angle + 360);
      }
      while (angle >= 360) {
        angle = toHueDegrees(angle - 360);
      }
      xyz[index] = angle;
    } else {
      xyz[index] = (xyz[index] ?? 0) / (counts[index] || 1);
    }
  }

  return writeAlpha(
    new Color(toColorChannelInput(xyz), mode),
    toAlphaChannel(alpha / length > 0.99999 ? 1 : alpha / length)
  );
}

function toAlphaChannel(value: number): AlphaChannel {
  return value as AlphaChannel;
}

function toHueDegrees(value: number): HueDegrees {
  return value as HueDegrees;
}

function toRadianAngle(value: number): RadianAngle {
  return value as RadianAngle;
}

function toNormalizedWeight(value: number): NormalizedWeight {
  return value as NormalizedWeight;
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
