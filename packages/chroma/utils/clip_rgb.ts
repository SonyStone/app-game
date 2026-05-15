import type { ColorChannelArray } from '../types';
import { limit } from './limit';

export function clip_rgb(rgb: ColorChannelArray): ColorChannelArray {
  rgb._clipped = false;
  rgb._unclipped = [...rgb];

  for (let index = 0; index <= 3; index += 1) {
    if (index < 3) {
      const value = rgb[index] ?? 0;
      if (value < 0 || value > 255) {
        rgb._clipped = true;
      }
      rgb[index] = limit(value, 0, 255);
      continue;
    }

    rgb[index] = limit(rgb[index] ?? 1, 0, 1);
  }

  return rgb;
}
