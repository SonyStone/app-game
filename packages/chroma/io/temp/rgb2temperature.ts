import { unpack } from '../../utils';
import { temperature2rgb } from './temperature2rgb';

const { round } = Math;

/**
 * Estimates the color temperature in Kelvin for a given RGB input.
 */
export function rgb2temperature(...args: unknown[]): number {
  const rgb = unpack(args, 'rgb') as number[];
  const r = rgb[0] ?? 0;
  const b = rgb[2] ?? 0;
  let minTemp = 1000;
  let maxTemp = 40000;
  const epsilon = 0.4;
  let temperature = minTemp;
  while (maxTemp - minTemp > epsilon) {
    temperature = (maxTemp + minTemp) * 0.5;
    const candidate = temperature2rgb(temperature);
    if ((candidate[2] ?? 0) / (candidate[0] ?? 1) >= b / Math.max(r, 1e-12)) {
      maxTemp = temperature;
    } else {
      minTemp = temperature;
    }
  }
  return round(temperature);
}
