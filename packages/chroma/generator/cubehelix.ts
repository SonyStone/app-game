import { Color } from '../color';
import type { ColorChannelInput } from '../types';
import { TWOPI, clip_rgb } from '../utils';
import { scale } from './scale';

const { cos, pow, sin } = Math;

type HueRange = number | [number, number];
type LightnessRange = number | [number, number];
type CubehelixFunction = ((fract: number) => Color) & {
  start: (value?: number) => number | CubehelixFunction;
  rotations: (value?: number) => number | CubehelixFunction;
  gamma: (value?: number) => number | CubehelixFunction;
  hue: (value?: HueRange) => HueRange | CubehelixFunction;
  lightness: (value?: LightnessRange) => [number, number] | CubehelixFunction;
  scale: () => ReturnType<typeof scale>;
};

/**
 * Creates a Cubehelix color generator.
 *
 * Cubehelix is useful for ramps that remain readable when converted to grayscale while still varying in hue.
 */
export function cubehelix(
  start = 300,
  rotations = -1.5,
  hue: HueRange = 1,
  gamma = 1,
  lightness: LightnessRange = [0, 1]
): CubehelixFunction {
  let hueDelta = 0;
  let lightnessRange: [number, number] = Array.isArray(lightness)
    ? [lightness[0] ?? 0, lightness[1] ?? 1]
    : [lightness, lightness];
  let lightnessDelta = lightnessRange[1] - lightnessRange[0];

  const generator = ((fract: number) => {
    const angle = TWOPI * ((start + 120) / 360 + rotations * fract);
    const lightnessValue = pow(lightnessRange[0] + lightnessDelta * fract, gamma);
    const hueValue = hueDelta !== 0 && Array.isArray(hue) ? hue[0] + fract * hueDelta : hue;
    const amplitude = (Number(hueValue) * lightnessValue * (1 - lightnessValue)) / 2;
    const red = lightnessValue + amplitude * (-0.14861 * cos(angle) + 1.78277 * sin(angle));
    const green = lightnessValue + amplitude * (-0.29227 * cos(angle) - 0.90649 * sin(angle));
    const blue = lightnessValue + amplitude * (1.97294 * cos(angle));
    return new Color(toColorChannelInput(clip_rgb([red * 255, green * 255, blue * 255, 1])), 'rgb');
  }) as CubehelixFunction;

  /** Sets the starting hue for the rotation. */
  generator.start = (value?: number) => {
    if (value == null) {
      return start;
    }
    start = value;
    return generator;
  };

  /** Sets the number and direction of hue rotations. */
  generator.rotations = (value?: number) => {
    if (value == null) {
      return rotations;
    }
    rotations = value;
    return generator;
  };

  /** Sets the gamma factor used to emphasize low or high intensity values. */
  generator.gamma = (value?: number) => {
    if (value == null) {
      return gamma;
    }
    gamma = value;
    return generator;
  };

  /**
   * Sets the hue intensity or hue range used across the rotation.
   */
  generator.hue = (value?: HueRange) => {
    if (value == null) {
      return hue;
    }
    hue = value;
    if (Array.isArray(hue)) {
      hueDelta = (hue[1] ?? hue[0] ?? 0) - (hue[0] ?? 0);
      if (hueDelta === 0) {
        hue = hue[1] ?? hue[0] ?? 0;
      }
    } else {
      hueDelta = 0;
    }
    return generator;
  };

  /** Sets the lightness range used by the generated colors. */
  generator.lightness = (value?: LightnessRange) => {
    if (value == null) {
      return lightnessRange;
    }
    lightnessRange = Array.isArray(value) ? [value[0] ?? 0, value[1] ?? value[0] ?? 0] : [value, value];
    lightnessDelta = lightnessRange[1] - lightnessRange[0];
    return generator;
  };

  /** Converts the generator into a regular chroma scale. */
  generator.scale = () => scale(generator);
  generator.hue(hue);
  return generator;
}

function toColorChannelInput(values: readonly number[]): ColorChannelInput {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}
