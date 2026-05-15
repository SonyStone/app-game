import type { ColorSpaces, HueDegrees, LabLightness, PolarColorChroma } from '../../types';
import { RAD2DEG, unpackNumberArray } from '../../utils';

const { atan2, round, sqrt } = Math;

export function lab2lch(...args: unknown[]): ColorSpaces['lch'] {
  const values = unpackNumberArray(args, 'lab');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [l = 0, a = 0, b = 0] = values;
  const chroma = sqrt(a * a + b * b);
  let hue = (atan2(b, a) * RAD2DEG + 360) % 360;
  if (round(chroma * 10000) === 0) {
    hue = Number.NaN;
  }
  return [toLabLightness(l), toPolarColorChroma(chroma), toHueDegrees(hue)];
}

function toHueDegrees(value: number): HueDegrees {
  return value as HueDegrees;
}

function toLabLightness(value: number): LabLightness {
  return value as LabLightness;
}

function toPolarColorChroma(value: number): PolarColorChroma {
  return value as PolarColorChroma;
}
