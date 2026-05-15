import { Color } from '../color';
import { scale } from '../generator/scale';

/** Preset scale factories exposed as `Color.scales` and `chroma.scales`. */
export const scales = {
  /** A cool blue-violet ramp built from HSL endpoints. */
  cool() {
    return scale([new Color([180, 1, 0.9], 'hsl'), new Color([250, 0.7, 0.4], 'hsl')]);
  },

  /** A hot black-red-yellow-white ramp. */
  hot() {
    return scale(['#000', '#f00', '#ff0', '#fff']).mode('rgb');
  }
} as const;
