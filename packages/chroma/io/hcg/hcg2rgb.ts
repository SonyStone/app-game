import { unpackNumberArray } from '../../utils';

const { floor } = Math;

/**
 * Converts HCG input into an internal RGBA tuple.
 */
export function hcg2rgb(...args: unknown[]): [number, number, number, number] {
  const values = unpackNumberArray(args, 'hcg');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [, c = 0, grayness = 0] = values;
  let h = values[0] ?? 0;
  const grayscale = grayness * 255;
  const chroma = c * 255;

  if (c === 0) {
    return [grayscale, grayscale, grayscale, values.length > 3 ? (values[3] ?? 1) : 1];
  } else {
    if (h === 360) {
      h = 0;
    }
    if (h > 360) {
      h -= 360;
    }
    if (h < 0) {
      h += 360;
    }
    h /= 60;
    const sector = floor(h);
    const fraction = h - sector;
    const p = grayscale * (1 - c);
    const q = p + chroma * (1 - fraction);
    const t = p + chroma * fraction;
    const v = p + chroma;
    let rgb: [number, number, number];
    switch (sector) {
      case 0:
        rgb = [v, t, p];
        break;
      case 1:
        rgb = [q, v, p];
        break;
      case 2:
        rgb = [p, v, t];
        break;
      case 3:
        rgb = [p, q, v];
        break;
      case 4:
        rgb = [t, p, v];
        break;
      default:
        rgb = [v, p, q];
        break;
    }
    return [...rgb, values.length > 3 ? (values[3] ?? 1) : 1];
  }
}
