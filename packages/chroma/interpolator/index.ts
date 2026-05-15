import type { InterpolatorRegistry } from '../types';
import { hcg } from './hcg';
import { hsi } from './hsi';
import { hsl } from './hsl';
import { hsv } from './hsv';
import { lab } from './lab';
import { lch } from './lch';
import { lrgb } from './lrgb';
import { num } from './num';
import { oklab } from './oklab';
import { oklch } from './oklch';
import { rgb } from './rgb';

export const interpolator = {
  rgb,
  hsl,
  hsv,
  hsi,
  hcg,
  lab,
  lch,
  hcl: lch,
  lrgb,
  num,
  oklab,
  oklch
} satisfies InterpolatorRegistry;
